import { describe, expect, it } from 'vitest';
import { DAMAGE_VISUAL_KIND_DARKNESS, EventBus } from '../EventBus';
import type { EngineContext } from '../EngineContext';
import { DarknessLevel } from '../darknessLevels';
import { Unit } from './Unit';
import { ShieldBuff } from '../../buffs/ShieldBuff';
import {
    DARKNESS_CORRUPTION_DRAIN_RATE,
    DARKNESS_CORRUPTION_FILL_RATE,
    DARKNESS_STRIKE_OUT_SECONDS,
    DARKNESS_STRIKE_SECONDS,
    darknessCorruptionDamage,
    darknessNeedlePoses,
    darknessNeedleRestBaseRadius,
    darknessPoolShape,
    darknessStrikeRadialOffset,
} from './darknessCorruption';
import { DARKNESS_CORRUPTION_LOOKS } from './darknessCorruptionLook';

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

type Point = { x: number; y: number };

function dist(p: Point): number {
    return Math.hypot(p.x, p.y);
}

const CLASSIC = DARKNESS_CORRUPTION_LOOKS.classic.needles;
const THORN = DARKNESS_CORRUPTION_LOOKS.rupture.needles;
const POOL = DARKNESS_CORRUPTION_LOOKS.rupture.pool;

describe('darkness needle poses', () => {
    it('grows needles clockwise, tangent first, then aimed inward', () => {
        const midGrow = (4 + CLASSIC.growFraction * 0.5) / CLASSIC.count;
        const poses = darknessNeedlePoses(RADIUS, midGrow, null, CLASSIC);

        expect(poses).toHaveLength(CLASSIC.count);
        expect(poses[3].visible).toBe(true);
        expect(poses[4].visible).toBe(true);
        expect(poses[5].visible).toBe(false);

        const aimed = poses[0];
        expect(dist(aimed.tip)).toBeLessThan(dist(aimed.base));
        expect(dist(aimed.base) - dist(aimed.tip)).toBeCloseTo(RADIUS * CLASSIC.lengthScale);

        const spinning = poses[4];
        expect(spinning.tip.x).toBeLessThan(spinning.base.x);
        expect(spinning.tip.y).toBeCloseTo(spinning.base.y);
    });

    it('hops the full ring outward, then sinks the tips to the impact radius', () => {
        expect(darknessStrikeRadialOffset(RADIUS, 0, CLASSIC)).toBe(0);
        expect(darknessStrikeRadialOffset(RADIUS, DARKNESS_STRIKE_OUT_SECONDS, CLASSIC)).toBeCloseTo(RADIUS * CLASSIC.hopScale);

        for (const style of [CLASSIC, THORN]) {
            const impact = darknessNeedlePoses(RADIUS, 1, DARKNESS_STRIKE_SECONDS, style);
            expect(impact.every((pose) => pose.visible)).toBe(true);
            expect(dist(impact[0].tip)).toBeCloseTo(RADIUS * style.impactTipScale);
        }
    });

    it('creeps the ring inward as it fills when the base scale falls', () => {
        const early = darknessNeedleRestBaseRadius(RADIUS, 0.1, THORN);
        const late = darknessNeedleRestBaseRadius(RADIUS, 0.9, THORN);
        expect(early).toBeGreaterThan(late);
        expect(darknessNeedleRestBaseRadius(RADIUS, 0, THORN)).toBeCloseTo(RADIUS * THORN.baseScale.start);
        expect(darknessNeedleRestBaseRadius(RADIUS, 1, THORN)).toBeCloseTo(RADIUS * THORN.baseScale.end);
        expect(darknessNeedleRestBaseRadius(RADIUS, 0.1, CLASSIC)).toBeCloseTo(darknessNeedleRestBaseRadius(RADIUS, 0.9, CLASSIC));
    });

    it('draws thorns widest near the base, so the long point aims inward', () => {
        const [pose] = darknessNeedlePoses(RADIUS, 1, null, THORN);
        expect(pose.points).toHaveLength(8);
        const waist = { x: (pose.points[2] + pose.points[6]) / 2, y: (pose.points[3] + pose.points[7]) / 2 };
        const toTip = Math.hypot(pose.tip.x - waist.x, pose.tip.y - waist.y);
        const toBase = Math.hypot(pose.base.x - waist.x, pose.base.y - waist.y);
        expect(toTip).toBeGreaterThan(toBase * 2);
        expect(dist(pose.tip)).toBeLessThan(dist(waist));
    });
});

describe('darkness pool shape', () => {
    it('grows with fill progress', () => {
        const small = darknessPoolShape(RADIUS, 0.1, null, 0, POOL);
        const big = darknessPoolShape(RADIUS, 0.9, null, 0, POOL);
        expect(big.radius).toBeGreaterThan(small.radius);
    });

    it('keeps wobbling on wall time while progress is frozen (paused battle)', () => {
        const a = darknessPoolShape(RADIUS, 0.5, null, 1, POOL);
        const b = darknessPoolShape(RADIUS, 0.5, null, 1.4, POOL);
        expect(a.points).not.toEqual(b.points);
        expect(a.radius).not.toBeCloseTo(b.radius, 3);
    });

    it('pulls in to the strike radius as the needles land', () => {
        const landed = darknessPoolShape(RADIUS, 1, DARKNESS_STRIKE_SECONDS, 0, POOL);
        expect(landed.radius).toBeCloseTo(RADIUS * POOL.strikeRadiusScale);
    });
});

describe('tickUnitDarknessCorruption', () => {
    it('fills the ring without dealing damage, then damages on the snap', () => {
        const unit = makeUnit();
        const engine = makeEngine(DarknessLevel.FULL_DARKNESS);

        unit.tickDarknessCorruption(1 / DARKNESS_CORRUPTION_FILL_RATE, engine);
        expect(unit.corruptionProgress).toBeCloseTo(1);
        expect(unit.darknessStrikeElapsed).toBe(0);
        expect(unit.hp).toBe(STARTING_HP);
        expect(unit.darknessDamageProcCount).toBe(0);

        const kinds: unknown[] = [];
        engine.eventBus.on('damage_taken', (ev) => kinds.push(ev.visualKind));
        unit.tickDarknessCorruption(DARKNESS_STRIKE_SECONDS, engine);
        expect(unit.hp).toBe(STARTING_HP - darknessCorruptionDamage(0));
        expect(kinds).toEqual([DAMAGE_VISUAL_KIND_DARKNESS]);
        expect(unit.darknessDamageProcCount).toBe(1);
        expect(unit.corruptionProgress).toBe(0);
        expect(unit.darknessStrikeElapsed).toBeNull();
    });

    it('goes through shields straight to HP', () => {
        const unit = makeUnit();
        const shield = new ShieldBuff(50, 0);
        unit.buffs = [shield];
        unit.tickDarknessCorruption(1 / DARKNESS_CORRUPTION_FILL_RATE + DARKNESS_STRIKE_SECONDS, makeEngine(DarknessLevel.FULL_DARKNESS));
        expect(unit.hp).toBe(STARTING_HP - darknessCorruptionDamage(0));
        expect(shield.remainingHp).toBe(50);
    });

    it('escalates the next strike that lands before the ring drains away', () => {
        const unit = makeUnit();
        const engine = makeEngine(DarknessLevel.FULL_DARKNESS);
        const cycle = 1 / DARKNESS_CORRUPTION_FILL_RATE + DARKNESS_STRIKE_SECONDS;

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
        unit.tickDarknessCorruption(1 / DARKNESS_CORRUPTION_FILL_RATE, dark);
        unit.tickDarknessCorruption(DARKNESS_STRIKE_OUT_SECONDS / 2, dark);
        expect(unit.darknessStrikeElapsed).toBeGreaterThan(0);

        const bright = makeEngine(DarknessLevel.BRIGHT_LIGHT);
        const drainSeconds = 0.2;
        unit.tickDarknessCorruption(drainSeconds, bright);

        expect(unit.hp).toBe(STARTING_HP);
        expect(unit.darknessDamageProcCount).toBe(0);
        expect(unit.darknessStrikeElapsed).toBeNull();
        expect(unit.corruptionProgress).toBeCloseTo(1 - drainSeconds * DARKNESS_CORRUPTION_DRAIN_RATE);
    });

    it('resets the damage escalation once the ring drains away', () => {
        const unit = makeUnit();
        unit.corruptionProgress = 0.4;
        unit.darknessDamageProcCount = 2;
        unit.tickDarknessCorruption(1 / DARKNESS_CORRUPTION_DRAIN_RATE, makeEngine(DarknessLevel.BRIGHT_LIGHT));
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
