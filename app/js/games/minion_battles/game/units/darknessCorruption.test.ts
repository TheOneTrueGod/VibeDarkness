import { describe, expect, it } from 'vitest';
import { EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import { DarknessLevel } from '../darknessLevels';
import { Unit } from './Unit';
import {
    DARKNESS_CORRUPTION_RATE,
    DARKNESS_NEEDLE_COUNT,
    DARKNESS_NEEDLE_GROW_FRACTION,
    DARKNESS_NEEDLE_IMPACT_TIP_SCALE,
    DARKNESS_NEEDLE_LENGTH_SCALE,
    DARKNESS_NEEDLE_OUTWARD_SCALE,
    DARKNESS_NEEDLE_TIP_RADIUS_SCALE,
    DARKNESS_STRIKE_OUT_SECONDS,
    DARKNESS_STRIKE_SECONDS,
    darknessCorruptionDamage,
    darknessNeedlePoses,
    darknessStrikeRadialOffset,
} from './darknessCorruption';

const RADIUS = 34;
const STARTING_HP = 100;

function makeUnit(): Unit {
    return new Unit({
        id: 'hero',
        x: 0,
        y: 0,
        hp: STARTING_HP,
        maxHp: STARTING_HP,
        speed: 100,
        teamId: 'player',
        ownerId: 'p1',
        characterId: 'player',
        name: 'hero',
    });
}

function makeEngine(light: number | null): EngineContext {
    return {
        getLightLevelAt: () => light,
        eventBus: new EventBus(),
    } as unknown as EngineContext;
}

function tipDistance(points: [number, number, number, number, number, number]): number {
    return Math.hypot(points[0], points[1]);
}

function baseCenter(points: [number, number, number, number, number, number]): { x: number; y: number } {
    return { x: (points[2] + points[4]) / 2, y: (points[3] + points[5]) / 2 };
}

describe('darkness needle poses', () => {
    it('grows needles clockwise, tangent first, then aimed inward', () => {
        const midGrow = (4 + DARKNESS_NEEDLE_GROW_FRACTION * 0.5) / DARKNESS_NEEDLE_COUNT;
        const poses = darknessNeedlePoses(RADIUS, midGrow, null);

        expect(poses).toHaveLength(DARKNESS_NEEDLE_COUNT);
        expect(poses[3].visible).toBe(true);
        expect(poses[4].visible).toBe(true);
        expect(poses[5].visible).toBe(false);

        const aimedTip = tipDistance(poses[0].points);
        const aimedBase = Math.hypot(baseCenter(poses[0].points).x, baseCenter(poses[0].points).y);
        expect(aimedTip).toBeCloseTo(RADIUS * DARKNESS_NEEDLE_TIP_RADIUS_SCALE);
        expect(aimedTip).toBeLessThan(aimedBase);
        expect((aimedTip + aimedBase) / 2).toBeCloseTo(RADIUS);

        const spinning = poses[4].points;
        const base = baseCenter(spinning);
        expect(spinning[0]).toBeLessThan(base.x);
        expect(spinning[1]).toBeCloseTo(base.y);
    });

    it('hops the full ring outward, then sinks the tips into the body', () => {
        const resting = darknessStrikeRadialOffset(RADIUS, 0);
        const hopped = darknessStrikeRadialOffset(RADIUS, DARKNESS_STRIKE_OUT_SECONDS);
        const struck = darknessStrikeRadialOffset(RADIUS, DARKNESS_STRIKE_SECONDS);
        expect(resting).toBe(0);
        expect(hopped).toBeCloseTo(RADIUS * DARKNESS_NEEDLE_OUTWARD_SCALE);
        expect(struck).toBeCloseTo(RADIUS * (DARKNESS_NEEDLE_IMPACT_TIP_SCALE - DARKNESS_NEEDLE_TIP_RADIUS_SCALE));

        const impact = darknessNeedlePoses(RADIUS, 1, DARKNESS_STRIKE_SECONDS);
        expect(impact.every((pose) => pose.visible)).toBe(true);
        expect(tipDistance(impact[0].points)).toBeCloseTo(RADIUS * DARKNESS_NEEDLE_IMPACT_TIP_SCALE);
        const base = Math.hypot(baseCenter(impact[0].points).x, baseCenter(impact[0].points).y);
        expect(base - tipDistance(impact[0].points)).toBeCloseTo(RADIUS * DARKNESS_NEEDLE_LENGTH_SCALE);
    });
});

describe('tickUnitDarknessCorruption', () => {
    it('fills the ring without dealing damage, then damages on the snap', () => {
        const unit = makeUnit();
        const engine = makeEngine(DarknessLevel.FULL_DARKNESS);

        unit.tickDarknessCorruption(1 / DARKNESS_CORRUPTION_RATE, engine);
        expect(unit.corruptionProgress).toBeCloseTo(1);
        expect(unit.darknessStrikeElapsed).toBe(0);
        expect(unit.hp).toBe(STARTING_HP);
        expect(unit.darknessDamageProcCount).toBe(0);

        unit.tickDarknessCorruption(DARKNESS_STRIKE_SECONDS, engine);
        expect(unit.hp).toBe(STARTING_HP - darknessCorruptionDamage(0));
        expect(unit.darknessDamageProcCount).toBe(1);
        expect(unit.corruptionProgress).toBe(0);
        expect(unit.darknessStrikeElapsed).toBeNull();
    });

    it('escalates the next strike that lands before the ring drains away', () => {
        const unit = makeUnit();
        const engine = makeEngine(DarknessLevel.FULL_DARKNESS);
        const cycle = 1 / DARKNESS_CORRUPTION_RATE + DARKNESS_STRIKE_SECONDS;

        unit.tickDarknessCorruption(cycle, engine);
        const hpAfterFirst = unit.hp;
        unit.tickDarknessCorruption(cycle, engine);

        expect(hpAfterFirst).toBe(STARTING_HP - darknessCorruptionDamage(0));
        expect(unit.hp).toBe(hpAfterFirst - darknessCorruptionDamage(1));
        expect(unit.darknessDamageProcCount).toBe(2);
    });

    it('cancels an in-progress strike when the unit leaves full darkness', () => {
        const unit = makeUnit();
        const dark = makeEngine(DarknessLevel.FULL_DARKNESS);
        unit.tickDarknessCorruption(1 / DARKNESS_CORRUPTION_RATE, dark);
        unit.tickDarknessCorruption(DARKNESS_STRIKE_OUT_SECONDS / 2, dark);
        expect(unit.darknessStrikeElapsed).toBeGreaterThan(0);

        const bright = makeEngine(DarknessLevel.BRIGHT_LIGHT);
        const drainSeconds = 0.2;
        unit.tickDarknessCorruption(drainSeconds, bright);

        expect(unit.hp).toBe(STARTING_HP);
        expect(unit.darknessDamageProcCount).toBe(0);
        expect(unit.darknessStrikeElapsed).toBeNull();
        expect(unit.corruptionProgress).toBeCloseTo(1 - drainSeconds * DARKNESS_CORRUPTION_RATE);
    });

    it('resets the damage escalation once the ring drains away', () => {
        const unit = makeUnit();
        unit.corruptionProgress = 0.4;
        unit.darknessDamageProcCount = 2;
        unit.tickDarknessCorruption(1 / DARKNESS_CORRUPTION_RATE, makeEngine(DarknessLevel.BRIGHT_LIGHT));
        expect(unit.corruptionProgress).toBe(0);
        expect(unit.darknessDamageProcCount).toBe(0);
    });

    it('round-trips a strike that has not landed yet', () => {
        const unit = makeUnit();
        unit.corruptionProgress = 1;
        unit.darknessStrikeElapsed = DARKNESS_STRIKE_OUT_SECONDS;
        const restored = Unit.fromJSON(unit.toJSON(0), new EventBus(), 0);
        expect(restored.corruptionProgress).toBe(1);
        expect(restored.darknessStrikeElapsed).toBeCloseTo(DARKNESS_STRIKE_OUT_SECONDS);
    });
});
