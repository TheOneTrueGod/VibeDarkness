import { describe, expect, it } from 'vitest';
import { TerrainLayerManager, type TerrainEffectRecord } from './TerrainLayerManager';
import { CELL_SIZE } from '../terrain/TerrainGrid';

function record(overrides: Partial<TerrainEffectRecord> & Pick<TerrainEffectRecord, 'id' | 'placedAtGameTime'>): TerrainEffectRecord {
    return {
        layer: 'ground',
        effectType: 'dark_thorn',
        area: { type: 'cell', col: 0, row: 0 },
        params: {},
        ...overrides,
    };
}

describe('TerrainLayerManager cell precedence', () => {
    it('newest effect wins a contested cell on add', () => {
        const mgr = new TerrainLayerManager();
        mgr.add(record({ id: 'old', placedAtGameTime: 0 }));
        mgr.add(record({ id: 'new', placedAtGameTime: 10 }));

        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('new');
    });

    it('does not let an older effect displace an already-claimed cell', () => {
        const mgr = new TerrainLayerManager();
        mgr.add(record({ id: 'new', placedAtGameTime: 10 }));
        mgr.add(record({ id: 'old', placedAtGameTime: 0 }));

        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('new');
    });

    it('reclaims a vacated cell with the newest remaining effect covering it', () => {
        const mgr = new TerrainLayerManager();
        mgr.add(record({ id: 'oldest', placedAtGameTime: 0 }));
        mgr.add(record({ id: 'middle', placedAtGameTime: 5 }));
        mgr.add(record({ id: 'newest', placedAtGameTime: 10 }));

        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('newest');

        mgr.remove('newest');
        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('middle');

        mgr.remove('middle');
        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('oldest');
    });

    it('expires effects independently of any owning unit', () => {
        const mgr = new TerrainLayerManager();
        mgr.add(record({ id: 'a', placedAtGameTime: 0, ownerUnitId: 'unit-1', expiresAtGameTime: 100 }));

        mgr.cleanupExpired(50);
        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('a');

        mgr.cleanupExpired(100);
        expect(mgr.getGroundEffectAt(0, 0)).toBeNull();
    });
});

describe('TerrainLayerManager deployables', () => {
    const bramble = (overrides: Partial<TerrainEffectRecord> = {}): TerrainEffectRecord =>
        record({
            id: 'b1',
            placedAtGameTime: 0,
            effectType: 'bramble_slow',
            ownerUnitId: 'u1',
            ownerAbilityId: 'a1',
            teamId: 'player',
            ...overrides,
        });

    it('round-trips owner and team through JSON', () => {
        const mgr = new TerrainLayerManager();
        mgr.add(bramble());
        const restored = TerrainLayerManager.fromJSON(mgr.toEffectsJSON());
        const r = restored.allEffects.get('b1');
        expect(r?.ownerUnitId).toBe('u1');
        expect(r?.ownerAbilityId).toBe('a1');
        expect(r?.teamId).toBe('player');
    });

    it('lists owned ground bramble with tag, team and cell-center position', () => {
        const mgr = new TerrainLayerManager();
        mgr.add(bramble({ area: { type: 'cell', col: 2, row: 3 } }));
        const list = mgr.listDeployables();
        expect(list).toHaveLength(1);
        expect(list[0]).toMatchObject({
            id: 'b1',
            kind: 'terrainEffect',
            teamId: 'player',
            tags: ['bramble'],
            active: true,
            x: 2 * CELL_SIZE + CELL_SIZE / 2,
            y: 3 * CELL_SIZE + CELL_SIZE / 2,
        });
    });

    it('does not list floor, rock or ownerless effects', () => {
        const mgr = new TerrainLayerManager();
        mgr.add(bramble({ id: 'floor', layer: 'floor' }));
        mgr.add(bramble({ id: 'ownerless', ownerUnitId: undefined, teamId: undefined, area: { type: 'cell', col: 5, row: 5 } }));
        expect(mgr.listDeployables()).toEqual([]);
    });

    it('consume removes the effect and frees its cells', () => {
        const mgr = new TerrainLayerManager();
        mgr.add(bramble());
        expect(mgr.getGroundEffectAt(0, 0)?.id).toBe('b1');
        expect(mgr.consume('b1')).toBe(true);
        expect(mgr.getGroundEffectAt(0, 0)).toBeNull();
        expect(mgr.consume('b1')).toBe(false);
    });
});
