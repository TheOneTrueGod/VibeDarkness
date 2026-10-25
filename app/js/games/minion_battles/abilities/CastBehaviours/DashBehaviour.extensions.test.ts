import { describe, expect, it } from 'vitest';
import '../AbilityRegistry';
import { DashBehaviour } from './DashBehaviour';
import { EventBus } from '../../game/EventBus';
import { Unit } from '../../game/units/Unit';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { CastBehaviourSetupContext, CastBehaviourTickContext } from '../castBehaviourTypes';
import type { ResolvedTarget } from '../../game/types';

function makeUnit(id: string, x: number, y: number, teamId: 'player' | 'enemy'): Unit {
    return new Unit({
        id, x, y, hp: 1000, maxHp: 1000, speed: 100, teamId,
        ownerId: teamId === 'player' ? 'p1' : 'ai', characterId: 'test', name: id,
    });
}

/** Terrain where every x >= 100 is a wall. */
const wallTerrain = {
    isPassable: (x: number) => x < 100,
    grid: { worldToGrid: (x: number, y: number) => ({ col: Math.floor(x / 40), row: Math.floor(y / 40) }) },
};

function runDash(dash: DashBehaviour, caster: Unit, units: Unit[], target: ResolvedTarget, windowSeconds = 0.4): void {
    let payload: unknown;
    const engine = {
        units, gameTime: 0, eventBus: new EventBus(), terrainManager: wallTerrain,
        getUnit: (id: string) => units.find((u) => u.id === id),
    } as unknown as AbilityEngineContext;
    const base = { caster, abilityId: 'dash', target, allTargets: [target], castPayload: {}, setBehaviourPayload: (d: unknown) => { payload = d; }, engine };
    dash.onSetup({ ...base, behaviourPayload: undefined } as CastBehaviourSetupContext);
    const dt = 1 / 60;
    let prev = 0;
    for (let t = dt; ; t += dt) {
        const progress = Math.min(1, t / windowSeconds);
        const ctx: CastBehaviourTickContext = {
            ...base, behaviourPayload: payload, windowProgress: progress, prevWindowProgress: prev,
            isFirstTick: prev === 0, isLastTick: progress >= 1,
        };
        dash.onTick(ctx);
        prev = progress;
        if (progress >= 1) break;
    }
}

const target: ResolvedTarget = { type: 'pixel', position: { x: 300, y: 20 } };

describe('DashBehaviour extensions', () => {
    it('stops at a wall by default and passes through with withPassThroughTerrain', () => {
        const blocked = makeUnit('a', 20, 20, 'player');
        runDash(new DashBehaviour().withMaxDistance(160), blocked, [blocked], target);
        expect(blocked.x).toBeLessThan(100);

        const ghost = makeUnit('b', 20, 20, 'player');
        runDash(new DashBehaviour().withMaxDistance(160).withPassThroughTerrain(), ghost, [ghost], target);
        expect(ghost.x).toBeCloseTo(180, 0);
    });

    it('reports each tile entered exactly once, in path order', () => {
        const caster = makeUnit('a', 20, 20, 'player');
        const tiles: string[] = [];
        runDash(
            new DashBehaviour().withMaxDistance(160).withPassThroughTerrain().withOnPathTile((_c, t) => tiles.push(`${t.col},${t.row}`)),
            caster, [caster], target,
        );
        expect(tiles).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0']);
    });

    it('withConstantSpeed arrives early on a short dash instead of slowing down', () => {
        const slow = makeUnit('a', 20, 20, 'player');
        const fast = makeUnit('b', 20, 20, 'player');
        const short: ResolvedTarget = { type: 'pixel', position: { x: 60, y: 20 } };
        // After half the window: proportional dash is half way (20px); constant speed has covered 80px, capped at the 40px target distance.
        const half = (dash: DashBehaviour, unit: Unit) => {
            let payload: unknown;
            const engine = { units: [unit], gameTime: 0, eventBus: new EventBus(), terrainManager: null, getUnit: () => undefined } as unknown as AbilityEngineContext;
            const base = { caster: unit, abilityId: 'd', target: short, allTargets: [short], castPayload: {}, setBehaviourPayload: (d: unknown) => { payload = d; }, engine };
            dash.onSetup({ ...base, behaviourPayload: undefined } as CastBehaviourSetupContext);
            dash.onTick({ ...base, behaviourPayload: payload, windowProgress: 0.5, prevWindowProgress: 0, isFirstTick: true, isLastTick: false });
        };
        half(new DashBehaviour().withMaxDistance(160), slow);
        half(new DashBehaviour().withMaxDistance(160).withConstantSpeed(), fast);
        expect(slow.x).toBeCloseTo(40, 0);
        expect(fast.x).toBeCloseTo(60, 0);
    });

    it('addHitbox maxTargets caps distinct hits, nearest first, one hit each', () => {
        const caster = makeUnit('c', 20, 20, 'player');
        const e1 = makeUnit('e1', 40, 20, 'enemy');
        const e2 = makeUnit('e2', 41, 20, 'enemy');
        const e3 = makeUnit('e3', 42, 20, 'enemy');
        const units = [caster, e3, e2, e1];
        runDash(
            new DashBehaviour().withMaxDistance(10).addHitbox('caster', { shape: 'circle', range: 'caster' }, { damage: 5, attackType: 'melee', maxTargets: 2 }),
            caster, units, { type: 'pixel', position: { x: 30, y: 20 } },
        );
        const hit = [e1, e2, e3].map((u) => u.maxHp - u.hp);
        expect(hit.filter((d) => d === 5)).toHaveLength(2);
        expect(hit.filter((d) => d === 0)).toHaveLength(1);
        expect(e3.maxHp - e3.hp).toBe(0);
    });
});
