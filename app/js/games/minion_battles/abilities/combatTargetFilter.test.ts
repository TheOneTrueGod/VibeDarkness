import { describe, expect, it } from 'vitest';
import { filterCombatHitTargets } from './combatTargetFilter';
import type { Unit } from '../game/units/Unit';

function makeUnit(overrides: {
    id: string;
    active?: boolean;
    alive?: boolean;
    spawning?: boolean;
    hasIFrames?: boolean;
}): Unit {
    const {
        id,
        active = true,
        alive = true,
        spawning = false,
        hasIFrames = false,
    } = overrides;
    return {
        id,
        active,
        isAlive: () => alive,
        isSpawning: () => spawning,
        hasIFrames: () => hasIFrames,
    } as unknown as Unit;
}

const GAME_TIME = 1.5;

describe('filterCombatHitTargets', () => {
    it('excludes iframe units by default', () => {
        const normal = makeUnit({ id: 'normal' });
        const iframe = makeUnit({ id: 'iframe', hasIFrames: true });
        const result = filterCombatHitTargets([normal, iframe], GAME_TIME);
        expect(result.map((u) => u.id)).toEqual(['normal']);
    });

    it('includes iframe units when respectIFrames is false', () => {
        const normal = makeUnit({ id: 'normal' });
        const iframe = makeUnit({ id: 'iframe', hasIFrames: true });
        const result = filterCombatHitTargets([normal, iframe], GAME_TIME, {
            respectIFrames: false,
        });
        expect(result.map((u) => u.id)).toEqual(['normal', 'iframe']);
    });

    it('always drops dead units', () => {
        const dead = makeUnit({ id: 'dead', alive: false });
        const deadIframe = makeUnit({ id: 'dead-iframe', alive: false, hasIFrames: true });
        expect(filterCombatHitTargets([dead, deadIframe], GAME_TIME)).toEqual([]);
        expect(
            filterCombatHitTargets([dead, deadIframe], GAME_TIME, { respectIFrames: false }),
        ).toEqual([]);
    });

    it('always drops spawning units', () => {
        const spawning = makeUnit({ id: 'spawn', spawning: true });
        const spawningIframe = makeUnit({
            id: 'spawn-iframe',
            spawning: true,
            hasIFrames: true,
        });
        expect(filterCombatHitTargets([spawning, spawningIframe], GAME_TIME)).toEqual([]);
        expect(
            filterCombatHitTargets([spawning, spawningIframe], GAME_TIME, {
                respectIFrames: false,
            }),
        ).toEqual([]);
    });

    it('always drops inactive units', () => {
        const inactive = makeUnit({ id: 'inactive', active: false });
        expect(filterCombatHitTargets([inactive], GAME_TIME)).toEqual([]);
        expect(
            filterCombatHitTargets([inactive], GAME_TIME, { respectIFrames: false }),
        ).toEqual([]);
    });
});
