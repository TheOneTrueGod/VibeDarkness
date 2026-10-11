import { describe, expect, it, vi } from 'vitest';
import { TerrainLayerManager, type TerrainEffectRecord } from '../TerrainLayerManager';
import { EventBus } from '../EventBus';
import { TerrainType } from '../../terrain/TerrainType';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { TERRAIN_EFFECT_DEFS } from './terrainEffectDefs';
import { TERRAIN_CLEARS, clearTerrainEffects, matchesClearSpec, type TerrainClearSpec } from './terrainClearing';

function record(
    overrides: Partial<TerrainEffectRecord> & Pick<TerrainEffectRecord, 'id'>,
): TerrainEffectRecord {
    return {
        layer: 'ground',
        effectType: 'bramble_slow',
        placedAtGameTime: 0,
        area: { type: 'cell', col: 0, row: 0 },
        params: {},
        ...overrides,
    };
}

function setup() {
    const terrainLayers = new TerrainLayerManager();
    const eventBus = new EventBus();
    return { terrainLayers, eventBus, ctx: { terrainLayers, eventBus } };
}

const CELL_0_0 = [{ col: 0, row: 0 }];

describe('clearTerrainEffects presets', () => {
    it('scour clears ground and leaves air', () => {
        const { terrainLayers, ctx } = setup();
        terrainLayers.add(record({ id: 'g' }));
        terrainLayers.add(record({ id: 'a', layer: 'air' }));
        clearTerrainEffects(ctx, CELL_0_0, TERRAIN_CLEARS.scour);
        expect(terrainLayers.getGroundEffectAt(0, 0)).toBeNull();
        expect(terrainLayers.getAirEffectAt(0, 0)?.id).toBe('a');
    });

    it('gust clears air and leaves ground', () => {
        const { terrainLayers, ctx } = setup();
        terrainLayers.add(record({ id: 'g' }));
        terrainLayers.add(record({ id: 'a', layer: 'air' }));
        clearTerrainEffects(ctx, CELL_0_0, TERRAIN_CLEARS.gust);
        expect(terrainLayers.getGroundEffectAt(0, 0)?.id).toBe('g');
        expect(terrainLayers.getAirEffectAt(0, 0)).toBeNull();
    });

    it('blast clears both layers', () => {
        const { terrainLayers, ctx } = setup();
        terrainLayers.add(record({ id: 'g' }));
        terrainLayers.add(record({ id: 'a', layer: 'air' }));
        clearTerrainEffects(ctx, CELL_0_0, TERRAIN_CLEARS.blast);
        expect(terrainLayers.getGroundEffectAt(0, 0)).toBeNull();
        expect(terrainLayers.getAirEffectAt(0, 0)).toBeNull();
    });

    it('never touches floor tiles', () => {
        const { terrainLayers, ctx } = setup();
        terrainLayers.setFloorTile(0, 0, { terrainType: TerrainType.Rock });
        terrainLayers.add(record({ id: 'g' }));
        clearTerrainEffects(ctx, CELL_0_0, TERRAIN_CLEARS.blast);
        expect(terrainLayers.getFloorTile(0, 0)?.terrainType).toBe(TerrainType.Rock);
    });
});

describe('clearTerrainEffects overlap and carving', () => {
    it('clears every matching overlapping record so nothing reclaims the cell', () => {
        const { terrainLayers, ctx } = setup();
        terrainLayers.add(record({ id: 'old', placedAtGameTime: 0 }));
        terrainLayers.add(record({ id: 'new', placedAtGameTime: 10 }));
        const cleared = clearTerrainEffects(ctx, CELL_0_0, TERRAIN_CLEARS.scour);
        expect(cleared.map((c) => c.id).sort()).toEqual(['new', 'old']);
        expect(terrainLayers.getGroundEffectAt(0, 0)).toBeNull();
        expect(terrainLayers.getEffectsCoveringCell('ground', 0, 0)).toEqual([]);
        expect(terrainLayers.allEffects.size).toBe(0);
    });

    it('a non-matching older record reclaims the cell when the newer one is cleared', () => {
        const { terrainLayers, ctx } = setup();
        terrainLayers.add(record({ id: 'old', effectType: 'dark_thorn', placedAtGameTime: 0 }));
        terrainLayers.add(record({ id: 'new', effectType: 'bramble_slow', placedAtGameTime: 10 }));
        clearTerrainEffects(ctx, CELL_0_0, { layers: ['ground'], effectTypes: ['bramble_slow'] });
        expect(terrainLayers.getGroundEffectAt(0, 0)?.id).toBe('old');
    });

    it('carves a cells record: only the cleared cell goes, id is kept, revision bumps', () => {
        const { terrainLayers, ctx } = setup();
        terrainLayers.add(
            record({
                id: 'multi',
                area: { type: 'cells', cells: [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }] },
            }),
        );
        clearTerrainEffects(ctx, [{ col: 1, row: 0 }], TERRAIN_CLEARS.scour);
        expect(terrainLayers.getGroundEffectAt(1, 0)).toBeNull();
        expect(terrainLayers.getGroundEffectAt(0, 0)?.id).toBe('multi');
        expect(terrainLayers.getGroundEffectAt(2, 0)?.id).toBe('multi');
        const rec = terrainLayers.allEffects.get('multi');
        expect(rec?.area).toEqual({ type: 'cells', cells: [{ col: 0, row: 0 }, { col: 2, row: 0 }] });
        expect(rec?.revision).toBe(1);
    });

    it('carves a circle record into a cells list and removes it when empty', () => {
        const { terrainLayers, ctx } = setup();
        terrainLayers.add(
            record({
                id: 'circle',
                area: { type: 'circle', x: 5.5 * CELL_SIZE, y: 5.5 * CELL_SIZE, radiusPx: CELL_SIZE * 1.1 },
            }),
        );
        const before = terrainLayers.getEffectsCoveringCell('ground', 5, 5);
        expect(before).toHaveLength(1);
        clearTerrainEffects(ctx, [{ col: 5, row: 5 }], TERRAIN_CLEARS.scour);
        const rec = terrainLayers.allEffects.get('circle');
        expect(rec).toBeDefined();
        expect(rec?.area.type).toBe('cells');
        expect(terrainLayers.getGroundEffectAt(5, 5)).toBeNull();
        expect(terrainLayers.getGroundEffectAt(6, 5)?.id).toBe('circle');

        // Clear the rest of the cells; the record disappears.
        const remaining = (rec!.area as { type: 'cells'; cells: Array<{ col: number; row: number }> }).cells;
        clearTerrainEffects(ctx, remaining, TERRAIN_CLEARS.scour);
        expect(terrainLayers.allEffects.has('circle')).toBe(false);
    });

    it('accepts an area target and rasterizes it', () => {
        const { terrainLayers, ctx } = setup();
        terrainLayers.add(record({ id: 'a', area: { type: 'cell', col: 3, row: 3 } }));
        terrainLayers.add(record({ id: 'b', area: { type: 'cell', col: 9, row: 9 } }));
        clearTerrainEffects(
            ctx,
            { type: 'circle', x: 3.5 * CELL_SIZE, y: 3.5 * CELL_SIZE, radiusPx: CELL_SIZE * 0.6 },
            TERRAIN_CLEARS.scour,
        );
        expect(terrainLayers.allEffects.has('a')).toBe(false);
        expect(terrainLayers.allEffects.has('b')).toBe(true);
    });
});

describe('matchesClearSpec filters', () => {
    it('effectTypes allow-list and excludeEffectTypes deny-list', () => {
        const bramble = record({ id: 'b', effectType: 'bramble_slow' });
        const thorn = record({ id: 't', effectType: 'dark_thorn' });
        const allow: TerrainClearSpec = { layers: ['ground'], effectTypes: ['bramble_slow'] };
        expect(matchesClearSpec(bramble, allow)).toBe(true);
        expect(matchesClearSpec(thorn, allow)).toBe(false);
        const deny: TerrainClearSpec = { layers: ['ground'], excludeEffectTypes: ['bramble_slow'] };
        expect(matchesClearSpec(bramble, deny)).toBe(false);
        expect(matchesClearSpec(thorn, deny)).toBe(true);
    });

    it('team include and exclude', () => {
        const player = record({ id: 'p', teamId: 'player' });
        const enemy = record({ id: 'e', teamId: 'enemy' });
        const include: TerrainClearSpec = { layers: ['ground'], teams: { include: ['enemy'] } };
        expect(matchesClearSpec(player, include)).toBe(false);
        expect(matchesClearSpec(enemy, include)).toBe(true);
        const exclude: TerrainClearSpec = { layers: ['ground'], teams: { exclude: ['enemy'] } };
        expect(matchesClearSpec(player, exclude)).toBe(true);
        expect(matchesClearSpec(enemy, exclude)).toBe(false);
    });

    it('a clearResistant def survives even blast', () => {
        const { terrainLayers, ctx } = setup();
        const original = TERRAIN_EFFECT_DEFS['dark_thorn'];
        (TERRAIN_EFFECT_DEFS as Record<string, typeof original>)['dark_thorn'] = { ...original, clearResistant: true };
        try {
            terrainLayers.add(record({ id: 'resistant', effectType: 'dark_thorn' }));
            clearTerrainEffects(ctx, CELL_0_0, TERRAIN_CLEARS.blast);
            expect(terrainLayers.allEffects.has('resistant')).toBe(true);
        } finally {
            (TERRAIN_EFFECT_DEFS as Record<string, typeof original>)['dark_thorn'] = original;
        }
    });
});

describe('terrain_effects_cleared event', () => {
    it('fires with the cleared list and source', () => {
        const { terrainLayers, eventBus, ctx } = setup();
        const handler = vi.fn();
        eventBus.on('terrain_effects_cleared', handler);
        terrainLayers.add(record({ id: 'g' }));
        clearTerrainEffects(ctx, CELL_0_0, TERRAIN_CLEARS.scour, { unitId: 'u1', abilityId: '0537' });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({
            cleared: [{ id: 'g', effectType: 'bramble_slow', layer: 'ground', col: 0, row: 0 }],
            source: { unitId: 'u1', abilityId: '0537' },
        });
    });

    it('does not fire when nothing was cleared', () => {
        const { terrainLayers, eventBus, ctx } = setup();
        const handler = vi.fn();
        eventBus.on('terrain_effects_cleared', handler);
        terrainLayers.add(record({ id: 'a', layer: 'air' }));
        clearTerrainEffects(ctx, CELL_0_0, TERRAIN_CLEARS.scour);
        expect(handler).not.toHaveBeenCalled();
    });
});

describe('save/load after a carve', () => {
    it('keeps the carved area', () => {
        const { terrainLayers, ctx } = setup();
        terrainLayers.add(
            record({
                id: 'multi',
                area: { type: 'cells', cells: [{ col: 0, row: 0 }, { col: 1, row: 0 }] },
            }),
        );
        clearTerrainEffects(ctx, [{ col: 0, row: 0 }], TERRAIN_CLEARS.scour);
        const restored = TerrainLayerManager.fromJSON(terrainLayers.toEffectsJSON());
        expect(restored.getGroundEffectAt(0, 0)).toBeNull();
        expect(restored.getGroundEffectAt(1, 0)?.id).toBe('multi');
        expect(restored.allEffects.get('multi')?.area).toEqual({ type: 'cells', cells: [{ col: 1, row: 0 }] });
    });
});
