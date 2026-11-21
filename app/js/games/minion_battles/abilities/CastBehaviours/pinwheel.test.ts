/**
 * Pinwheel cast behaviour: schedule, arm geometry, presets and replay after a mid-cast round-trip.
 */
import { describe, it, expect } from 'vitest';
// Load the registry first (see behaviours.test.ts: avoids the CastBehaviours import cycle).
import '../AbilityRegistry';
import { CastBehaviours } from './index';
import { PinwheelBehaviour } from './PinwheelBehaviour';
import { PINWHEEL_PRESETS, pinwheelConfig, type PinwheelPresetId } from '../pinwheelPresets';
import type { CastBehaviourSetupContext, CastBehaviourTickContext } from '../castBehaviourTypes';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { Unit } from '../../game/units/Unit';
import type { ResolvedTarget } from '../../game/types';
import type { Projectile } from '../../game/projectiles/Projectile';
import { wildHitRule } from '../../game/hitRule';
import { UnitTag } from '../../game/units/unitTag';

const WINDOW = 5;
const DT = 1 / 60;
const caster = { id: 'heart', teamId: 'enemy', x: 100, y: 200, radius: 20 } as unknown as Unit;
const target = { type: 'pixel', position: { x: 100, y: 200 } } as ResolvedTarget;
const PROJECTILE = { damage: 3, radius: 5, range: 480, type: 'thorn', hitRule: wildHitRule(UnitTag.GardenKin) };

interface Harness {
    projectiles: Projectile[];
    payload: { current: unknown };
    engine: AbilityEngineContext;
}

function makeHarness(roll = 0): Harness {
    const projectiles: Projectile[] = [];
    const engine = {
        projectiles,
        addProjectile: (p: Projectile) => { p.id = `p${projectiles.length}`; projectiles.push(p); },
        getUnit: () => undefined,
        units: [],
        gameTime: 0,
        generateRandomInteger: () => roll,
    } as unknown as AbilityEngineContext;
    return { projectiles, payload: { current: undefined }, engine };
}

function setup(b: PinwheelBehaviour, h: Harness): void {
    const ctx: CastBehaviourSetupContext = {
        caster, abilityId: 'pinwheel', target, allTargets: [target], castPayload: {},
        behaviourPayload: undefined, setBehaviourPayload: (d) => { h.payload.current = d; }, engine: h.engine,
        windowSeconds: WINDOW,
    };
    b.onSetup(ctx);
}

/** Ticks from window progress `fromTick` (exclusive start) to `toTick` in DT steps. */
function tick(b: PinwheelBehaviour, h: Harness, fromTick: number, toTick: number): void {
    const total = Math.round(WINDOW / DT);
    for (let i = fromTick; i < toTick; i++) {
        const progress = Math.min(1, (i + 1) / total);
        const prev = Math.min(1, i / total);
        const ctx: CastBehaviourTickContext = {
            caster, abilityId: 'pinwheel', target, allTargets: [target], castPayload: {},
            behaviourPayload: h.payload.current, setBehaviourPayload: (d) => { h.payload.current = d; },
            engine: h.engine, windowProgress: progress, prevWindowProgress: prev,
            isFirstTick: i === 0, isLastTick: progress >= 1,
        };
        b.onTick(ctx);
    }
}

const TOTAL_TICKS = Math.round(WINDOW / DT);

function runPreset(id: PinwheelPresetId, roll = 0): Harness {
    const h = makeHarness(roll);
    const b = CastBehaviours.Pinwheel(pinwheelConfig(id, PROJECTILE));
    setup(b, h);
    tick(b, h, 0, TOTAL_TICKS);
    return h;
}

const angleDeg = (p: Projectile) => (((Math.atan2(p.velocityY, p.velocityX) * 180) / Math.PI) + 360) % 360;
/** Smallest signed angle from a to b, degrees. */
const diff = (a: number, b: number) => ((((b - a) % 360) + 540) % 360) - 180;

describe('Pinwheel presets', () => {
    it('holds the planned numbers', () => {
        expect(PINWHEEL_PRESETS.gentle).toMatchObject({ arms: 1, counterArms: 0, turnDegPerSec: 72, fireIntervalSec: 0.2 });
        expect(PINWHEEL_PRESETS.doubled).toMatchObject({ arms: 2, fireIntervalSec: 0.25 });
        expect(PINWHEEL_PRESETS.swift).toMatchObject({ turnDegPerSec: 144, fireIntervalSec: 0.15, projectileSpeed: 140 });
        expect(PINWHEEL_PRESETS.weave).toMatchObject({ arms: 1, counterArms: 1 });
    });

    it('pinwheelConfig takes the speed from the preset and the rest from the ability', () => {
        const cfg = pinwheelConfig('swift', PROJECTILE);
        expect(cfg.projectile).toMatchObject({ speed: 140, damage: 3, range: 480 });
        expect(cfg.startAngle).toBe('random');
    });
});

describe('Pinwheel behaviour', () => {
    it('Gentle fires 25 thorns over 5 s along one turning line', () => {
        const h = runPreset('gentle', 0);
        expect(h.projectiles).toHaveLength(25);
        const angles = h.projectiles.map(angleDeg);
        // Start roll 0, then 72 deg/s * 0.2 s = 14.4 deg per shot, clockwise.
        for (let k = 0; k < 25; k++) expect(diff(angles[k]!, (k * 14.4) % 360)).toBeCloseTo(0, 3);
        expect(Math.hypot(h.projectiles[0]!.velocityX, h.projectiles[0]!.velocityY)).toBeCloseTo(110);
        expect(h.projectiles[0]!.x).toBe(100);
        expect(h.projectiles[0]!.y).toBe(200);
    });

    it('takes the random start from the engine RNG as a whole degree and keeps it', () => {
        const h = runPreset('gentle', 123);
        expect(angleDeg(h.projectiles[0]!)).toBeCloseTo(123, 3);
        expect((h.payload.current as { startDeg: number }).startDeg).toBe(123);
    });

    it('Doubled fires two opposite lines', () => {
        const h = runPreset('doubled', 10);
        expect(h.projectiles).toHaveLength(40);
        for (let k = 0; k < 20; k++) {
            const a = angleDeg(h.projectiles[k * 2]!);
            const b = angleDeg(h.projectiles[k * 2 + 1]!);
            expect(Math.abs(diff(a, b))).toBeCloseTo(180, 3);
        }
    });

    it("Weave's two arms turn in opposite directions, starting opposite", () => {
        const h = runPreset('weave', 0);
        expect(h.projectiles).toHaveLength(40);
        const cw = angleDeg(h.projectiles[0]!);
        const ccw = angleDeg(h.projectiles[1]!);
        expect(Math.abs(diff(cw, ccw))).toBeCloseTo(180, 3);
        const cwNext = angleDeg(h.projectiles[2]!);
        const ccwNext = angleDeg(h.projectiles[3]!);
        expect(diff(cw, cwNext)).toBeGreaterThan(0);
        expect(diff(ccw, ccwNext)).toBeLessThan(0);
        expect(diff(cw, cwNext)).toBeCloseTo(-diff(ccw, ccwNext), 3);
    });

    it('carries the hit rule and projectile settings onto every thorn', () => {
        const h = runPreset('gentle');
        for (const p of h.projectiles) {
            expect(p.hitRule).toEqual(wildHitRule(UnitTag.GardenKin));
            expect(p.radius).toBe(5);
            expect(p.damage).toBe(3);
            expect(p.maxDistance).toBe(480);
        }
    });

    it('replays the same projectiles after a mid-cast round-trip of the payload', () => {
        const straight = runPreset('weave', 77);

        const h = makeHarness(77);
        const first = CastBehaviours.Pinwheel(pinwheelConfig('weave', PROJECTILE));
        setup(first, h);
        tick(first, h, 0, 100);
        // Save and reload mid-cast: a fresh behaviour and a JSON round-tripped payload.
        h.payload.current = JSON.parse(JSON.stringify(h.payload.current));
        const second = CastBehaviours.Pinwheel(pinwheelConfig('weave', PROJECTILE));
        tick(second, h, 100, TOTAL_TICKS);

        const shape = (ps: Projectile[]) => ps.map((p) => [p.velocityX.toFixed(6), p.velocityY.toFixed(6)]);
        expect(h.projectiles).toHaveLength(straight.projectiles.length);
        expect(shape(h.projectiles)).toEqual(shape(straight.projectiles));
    });

    it('fires nothing without a window', () => {
        const h = makeHarness();
        const b = CastBehaviours.Pinwheel(pinwheelConfig('gentle', PROJECTILE));
        // Setup without a reported window length and none in the config.
        b.onSetup({
            caster, abilityId: 'pinwheel', target, allTargets: [target], castPayload: {}, behaviourPayload: undefined,
            setBehaviourPayload: (d) => { h.payload.current = d; }, engine: h.engine,
        });
        tick(b, h, 0, TOTAL_TICKS);
        expect(h.projectiles).toHaveLength(0);
    });
});
