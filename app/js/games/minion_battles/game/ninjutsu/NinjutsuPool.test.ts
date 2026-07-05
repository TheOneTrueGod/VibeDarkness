import { describe, it, expect } from 'vitest';
import { NinjutsuPool, effectiveNinjutsuMaxPool } from './NinjutsuPool';
import type { NinjutsuPoolConfig } from './ninjutsuConfig';
import { ROUND_DURATION } from '../gameConstants';

const NO_ENEMY_UNITS = 0;

function makeConfig(overrides: Partial<NinjutsuPoolConfig> = {}): NinjutsuPoolConfig {
    return {
        enabled: true,
        maxPool: 3,
        rechargeInterval: 1,
        pauseBetweenUses: 0.25,
        ...overrides,
    };
}

function makeUnit(id: string) {
    return { id } as any;
}

function makeAbility(id: string, priority = 0, ninjutsuCost?: number, ninjutsuDelay?: number) {
    return {
        id,
        aiSettings: {
            priority,
            ninjutsu: {
                ...(ninjutsuCost !== undefined ? { cost: ninjutsuCost } : {}),
                ...(ninjutsuDelay !== undefined ? { overrideDelay: ninjutsuDelay } : {}),
            },
        },
    } as any;
}

describe('NinjutsuPool', () => {
    it('grants highest-priority request first', () => {
        const pool = new NinjutsuPool('shadow', makeConfig({ maxPool: 1, pauseBetweenUses: 0 }));

        pool.registerRequest(makeUnit('a'), makeAbility('atk', 1), [], undefined, 0);
        pool.registerRequest(makeUnit('b'), makeAbility('atk', 2), [], undefined, 0);

        const granted: string[] = [];
        pool.resolveRequests(0, (_tick, order) => granted.push(order.unitId), () => 0, NO_ENEMY_UNITS);

        expect(granted).toEqual(['b']);
        expect(pool.current).toBe(0);
    });

    it('random tie-break among equal-priority requests', () => {
        const pool = new NinjutsuPool('shadow', makeConfig({ maxPool: 1, pauseBetweenUses: 0 }));

        pool.registerRequest(makeUnit('a'), makeAbility('atk', 2), [], undefined, 0);
        pool.registerRequest(makeUnit('b'), makeAbility('atk', 2), [], undefined, 0);

        // random always returns 1 → picks index 1 of tied list = 'b'
        const granted: string[] = [];
        pool.resolveRequests(0, (_tick, order) => granted.push(order.unitId), (_min, _max) => 1, NO_ENEMY_UNITS);
        expect(granted).toEqual(['b']);
    });

    it('enforces cooldown: second resolveRequests call at same time grants nothing', () => {
        const pool = new NinjutsuPool('shadow', makeConfig({ maxPool: 3, pauseBetweenUses: 0.25 }));
        const gameTime = 5;

        pool.registerRequest(makeUnit('a'), makeAbility('atk'), [], undefined, 0);
        const granted: string[] = [];
        pool.resolveRequests(gameTime, (_tick, order) => granted.push(order.unitId), () => 0, NO_ENEMY_UNITS);
        expect(granted).toHaveLength(1);

        // Register another unit and resolve again at the same time — cooldown blocks it
        pool.registerRequest(makeUnit('b'), makeAbility('atk'), [], undefined, 0);
        pool.resolveRequests(gameTime, (_tick, order) => granted.push(order.unitId), () => 0, NO_ENEMY_UNITS);
        expect(granted).toHaveLength(1);

        // After the pause interval passes, grants proceed again
        const afterCooldown = gameTime + 0.25 * ROUND_DURATION;
        pool.registerRequest(makeUnit('b'), makeAbility('atk'), [], undefined, 0);
        pool.resolveRequests(afterCooldown, (_tick, order) => granted.push(order.unitId), () => 0, NO_ENEMY_UNITS);
        expect(granted).toHaveLength(2);
        expect(granted[1]).toBe('b');
    });

    it('stops granting after pool is exhausted', () => {
        const pool = new NinjutsuPool('shadow', makeConfig({ maxPool: 2, pauseBetweenUses: 0 }));

        pool.registerRequest(makeUnit('a'), makeAbility('atk'), [], undefined, 0);
        pool.registerRequest(makeUnit('b'), makeAbility('atk'), [], undefined, 0);
        pool.registerRequest(makeUnit('c'), makeAbility('atk'), [], undefined, 0);

        const granted: string[] = [];
        pool.resolveRequests(0, (_tick, order) => granted.push(order.unitId), () => 0, NO_ENEMY_UNITS);

        expect(granted).toHaveLength(2);
        expect(pool.current).toBe(0);
    });

    it('does not grant when disabled', () => {
        const pool = new NinjutsuPool('shadow', makeConfig({ enabled: false, maxPool: 5 }));

        pool.registerRequest(makeUnit('a'), makeAbility('atk'), [], undefined, 0);
        const granted: string[] = [];
        pool.resolveRequests(0, (_tick, order) => granted.push(order.unitId), () => 0, NO_ENEMY_UNITS);

        expect(granted).toHaveLength(0);
    });

    it('deduplicates requests from the same unit', () => {
        const pool = new NinjutsuPool('shadow', makeConfig({ maxPool: 3, pauseBetweenUses: 0 }));

        pool.registerRequest(makeUnit('a'), makeAbility('atk'), [], undefined, 0);
        pool.registerRequest(makeUnit('a'), makeAbility('atk'), [], undefined, 0);

        const granted: string[] = [];
        pool.resolveRequests(0, (_tick, order) => granted.push(order.unitId), () => 0, NO_ENEMY_UNITS);

        expect(granted).toHaveLength(1);
    });

    it('rechargeInterval = 1 refills every round', () => {
        const pool = new NinjutsuPool('shadow', makeConfig({ maxPool: 3, rechargeInterval: 1 }));
        pool.current = 0;

        pool.onRoundStart(1, NO_ENEMY_UNITS);
        expect(pool.current).toBe(3);

        pool.current = 0;
        pool.onRoundStart(2, NO_ENEMY_UNITS);
        expect(pool.current).toBe(3);
    });

    it('rechargeInterval = 2 refills on odd rounds only (1, 3, 5 …)', () => {
        const pool = new NinjutsuPool('shadow', makeConfig({ maxPool: 3, rechargeInterval: 2 }));

        // round 1: (1-1) % 2 === 0 → refill
        pool.current = 0;
        pool.onRoundStart(1, NO_ENEMY_UNITS);
        expect(pool.current).toBe(3);

        // round 2: (2-1) % 2 === 1 → no refill
        pool.current = 0;
        pool.onRoundStart(2, NO_ENEMY_UNITS);
        expect(pool.current).toBe(0);

        // round 3: (3-1) % 2 === 0 → refill
        pool.onRoundStart(3, NO_ENEMY_UNITS);
        expect(pool.current).toBe(3);

        // round 4: (4-1) % 2 === 1 → no refill
        pool.current = 0;
        pool.onRoundStart(4, NO_ENEMY_UNITS);
        expect(pool.current).toBe(0);
    });

    it('sub-round rechargeInterval refills pool mid-round via resolveRequests', () => {
        const rechargeInterval = 1 / 3;
        const pool = new NinjutsuPool('shadow', makeConfig({ maxPool: 2, rechargeInterval, pauseBetweenUses: 0 }));

        // Drain the pool at tick 0
        pool.registerRequest(makeUnit('a'), makeAbility('atk'), [], undefined, 0);
        pool.registerRequest(makeUnit('b'), makeAbility('atk'), [], undefined, 0);
        const granted: string[] = [];
        pool.resolveRequests(0, (_tick, order) => granted.push(order.unitId), () => 0, NO_ENEMY_UNITS);
        expect(granted).toHaveLength(2);
        expect(pool.current).toBe(0);

        // Before the recharge interval elapses, pool stays empty
        const beforeRecharge = rechargeInterval * ROUND_DURATION * 0.5;
        pool.registerRequest(makeUnit('a'), makeAbility('atk'), [], undefined, 0);
        pool.resolveRequests(beforeRecharge, (_tick, order) => granted.push(order.unitId), () => 0, NO_ENEMY_UNITS);
        expect(granted).toHaveLength(2);

        // At the recharge point the pool refills and new grants are issued
        const atRecharge = rechargeInterval * ROUND_DURATION;
        pool.registerRequest(makeUnit('a'), makeAbility('atk'), [], undefined, 0);
        pool.registerRequest(makeUnit('b'), makeAbility('atk'), [], undefined, 0);
        pool.resolveRequests(atRecharge, (_tick, order) => granted.push(order.unitId), () => 0, NO_ENEMY_UNITS);
        expect(granted).toHaveLength(4);
        expect(pool.current).toBe(0);

        // Second recharge fires after another interval
        const atSecondRecharge = atRecharge + rechargeInterval * ROUND_DURATION;
        pool.registerRequest(makeUnit('a'), makeAbility('atk'), [], undefined, 0);
        pool.resolveRequests(atSecondRecharge, (_tick, order) => granted.push(order.unitId), () => 0, NO_ENEMY_UNITS);
        expect(granted).toHaveLength(5);
    });

    it('sub-round rechargeInterval skips onRoundStart refill', () => {
        const pool = new NinjutsuPool('shadow', makeConfig({ maxPool: 3, rechargeInterval: 1 / 3, pauseBetweenUses: 0 }));
        pool.current = 0;
        pool.onRoundStart(1, NO_ENEMY_UNITS);
        expect(pool.current).toBe(0); // time-based system owns refills, not onRoundStart
    });

    it('respects overrideDelay from ability config', () => {
        const pool = new NinjutsuPool('shadow', makeConfig({ maxPool: 3, pauseBetweenUses: 0.5 }));

        // Ability overrides delay to 0 (no pause)
        pool.registerRequest(makeUnit('a'), makeAbility('atk', 0, 1, 0), [], undefined, 0);
        pool.registerRequest(makeUnit('b'), makeAbility('atk', 0, 1, 0), [], undefined, 0);

        const granted: string[] = [];
        // Both should be granted at t=0 because overrideDelay is 0
        pool.resolveRequests(0, (_tick, order) => granted.push(order.unitId), () => 0, NO_ENEMY_UNITS);
        expect(granted).toHaveLength(2);
    });

    it('ninjutsuPerUnit scales initial pool and round refills with live enemy count', () => {
        const perUnit = 0.1;
        const enemyCount = 10;
        const config = makeConfig({ maxPool: 4, rechargeInterval: 1, ninjutsuPerUnit: perUnit });
        const expectedMax = effectiveNinjutsuMaxPool(config, enemyCount);

        const pool = new NinjutsuPool('shadow', config, enemyCount);
        expect(pool.current).toBe(expectedMax);
        expect(pool.getUIState(enemyCount).max).toBe(expectedMax);

        pool.current = 0;
        pool.onRoundStart(1, enemyCount);
        expect(pool.current).toBe(expectedMax);
    });

    it('ninjutsuPerUnit scales sub-round recharge amount', () => {
        const perUnit = 0.1;
        const enemyCount = 15;
        const rechargeInterval = 1 / 3;
        const config = makeConfig({ maxPool: 4, rechargeInterval, pauseBetweenUses: 0, ninjutsuPerUnit: perUnit });
        const expectedMax = effectiveNinjutsuMaxPool(config, enemyCount);
        const pool = new NinjutsuPool('shadow', config, enemyCount);

        pool.current = 0;
        pool.resolveRequests(rechargeInterval * ROUND_DURATION, () => {}, () => 0, enemyCount);
        expect(pool.current).toBe(expectedMax);
    });
});
