import { describe, expect, it, vi } from 'vitest';
import '../AbilityRegistry';
import { strikeTerrain, terrainStrike } from './TerrainStrikeBehaviour';
import { TerrainGrid } from '../../terrain/TerrainGrid';
import { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainLayerManager } from '../../game/TerrainLayerManager';
import { TerrainType } from '../../terrain/TerrainType';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';
import type { Unit } from '../../game/units/Unit';

function makeWorld(rocks: Array<[number, number]>): TerrainManager {
    const grid = new TerrainGrid(8, 8, 40, TerrainType.Grass);
    for (const [c, r] of rocks) grid.set(c, r, TerrainType.Rock);
    const tm = new TerrainManager(grid);
    tm.setTerrainLayers(TerrainLayerManager.fromJSON([], []));
    return tm;
}

function tick(tm: TerrainManager, target: CastBehaviourTickContext['target'], flags: { first: boolean; last: boolean }): CastBehaviourTickContext {
    return {
        caster, abilityId: 't', target, allTargets: [target], castPayload: {}, behaviourPayload: undefined,
        setBehaviourPayload: () => {},
        engine: { terrainManager: tm, getUnit: () => undefined } as unknown as AbilityEngineContext,
        windowProgress: 1, prevWindowProgress: 0, isFirstTick: flags.first, isLastTick: flags.last,
    };
}

const caster = { id: 'c', x: 60, y: 60 } as unknown as Unit;

describe('strikeTerrain', () => {
    it('damages only intact rock tiles and reports them', () => {
        const tm = makeWorld([[1, 1], [2, 1]]);
        const spy = vi.spyOn(tm, 'damageRock');
        const struck = strikeTerrain({ terrainManager: tm }, caster, [{ col: 1, row: 1 }, { col: 3, row: 3 }, { col: 2, row: 1 }], { kind: 'damageRock', amount: 10 });
        expect(struck).toEqual([{ col: 1, row: 1 }, { col: 2, row: 1 }]);
        expect(spy).toHaveBeenCalledTimes(2);
        expect(spy).toHaveBeenCalledWith(1, 1, 10, 'c');
    });

    it('destroys rock outright with enough damage', () => {
        const tm = makeWorld([[1, 1]]);
        strikeTerrain({ terrainManager: tm }, caster, [{ col: 1, row: 1 }], { kind: 'damageRock', amount: 9999 });
        expect(tm.isIntactRockAt(1, 1)).toBe(false);
    });

    it('consume mode destroys one rock near the first tile', () => {
        const tm = makeWorld([[1, 1], [2, 1], [6, 6]]);
        const struck = strikeTerrain({ terrainManager: tm }, caster, [{ col: 2, row: 2 }], { kind: 'consumeRock', radiusTiles: 1.5 });
        expect(struck).toHaveLength(1);
        expect([tm.isIntactRockAt(1, 1), tm.isIntactRockAt(2, 1)].filter(Boolean)).toHaveLength(1);
        expect(tm.isIntactRockAt(6, 6)).toBe(true);
    });

    it('does nothing without a terrain manager', () => {
        expect(strikeTerrain({ terrainManager: null }, caster, [{ col: 1, row: 1 }], { kind: 'damageRock' })).toEqual([]);
    });
});

describe('TerrainStrikeBehaviour', () => {
    it('defaults to the tile at the target point and fires on the first tick only', () => {
        const tm = makeWorld([[3, 3]]);
        const b = terrainStrike().damageRock(9999);
        const target = { type: 'pixel' as const, position: { x: 3 * 40 + 20, y: 3 * 40 + 20 } };
        b.onTick(tick(tm, target, { first: false, last: true }));
        expect(tm.isIntactRockAt(3, 3)).toBe(true);
        b.onTick(tick(tm, target, { first: true, last: false }));
        expect(tm.isIntactRockAt(3, 3)).toBe(false);
    });

    it('at("end") fires on the last tick; atTiles + onStruck report struck tiles', () => {
        const tm = makeWorld([[1, 1], [2, 1]]);
        const seen: number[] = [];
        const b = terrainStrike().atTiles(() => [{ col: 1, row: 1 }, { col: 2, row: 1 }, { col: 5, row: 5 }])
            .damageRock(9999).at('end').onStruck((_c, struck) => seen.push(struck.length));
        const target = { type: 'pixel' as const, position: { x: 0, y: 0 } };
        b.onTick(tick(tm, target, { first: true, last: false }));
        expect(seen).toEqual([]);
        b.onTick(tick(tm, target, { first: false, last: true }));
        expect(seen).toEqual([2]);
    });

    it('atPoint strikes the tile under a resolved point, and skips on null', () => {
        const tm = makeWorld([[2, 2]]);
        const target = { type: 'pixel' as const, position: { x: 0, y: 0 } };
        terrainStrike().atPoint(() => null).damageRock(9999).onTick(tick(tm, target, { first: true, last: true }));
        expect(tm.isIntactRockAt(2, 2)).toBe(true);
        terrainStrike().atPoint(() => ({ x: 100, y: 100 })).damageRock(9999).onTick(tick(tm, target, { first: true, last: true }));
        expect(tm.isIntactRockAt(2, 2)).toBe(false);
    });
});
