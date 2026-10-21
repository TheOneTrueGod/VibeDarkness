import { describe, expect, it } from 'vitest';
import { Unit } from '../game/units/Unit';
import type { TeamId } from '../game/teams';
import type { ResolvedTarget } from '../game/types';
import type { AbilityTimingInterval } from './abilityTimings';
import { AbilityPhase, getEffectiveCastBehaviours } from './abilityTimings';
import { lungeStepDistance, StepLungeBehaviour } from './stepLunge';
import { meleeLineHitbox, nullHitbox } from '../hitboxes';
import { getSelectStepLungeDistance, resolveSelectTargetLockOnCandidates } from './targeting';
import type { SelectTargetDef } from './timingTargetDef';
import type { AbilityStatic } from './Ability';
import { CastBehaviours } from './CastBehaviours';

const REACH = 60;
const LUNGE = { distance: 20, duration: 0.1 };

function makeCaster(): Unit {
    return new Unit({
        id: 'caster', x: 0, y: 0, hp: 100, maxHp: 100, speed: 100,
        teamId: 'player' as TeamId, ownerId: 'p1', characterId: 'player', name: 'Caster',
    });
}

const engine = { getUnit: () => undefined, terrainManager: null };

/** Run setup then ticks at the given window progresses; returns the caster. */
function run(target: ResolvedTarget, progresses: number[], interruptAfter?: number): Unit {
    const caster = makeCaster();
    const behaviour = new StepLungeBehaviour(LUNGE, REACH);
    let payload: unknown;
    const base = {
        caster, abilityId: 'test', target, allTargets: [target], castPayload: undefined,
        get behaviourPayload() { return payload; },
        setBehaviourPayload: (p: unknown) => { payload = p; },
        engine: engine as never,
    };
    behaviour.onSetup(base);
    progresses.forEach((windowProgress, i) => {
        behaviour.onTick({ ...base, behaviourPayload: payload, windowProgress, prevWindowProgress: 0, isFirstTick: i === 0, isLastTick: false });
        if (interruptAfter === i) behaviour.onInterrupt({ ...base, behaviourPayload: payload });
    });
    return caster;
}

describe('lungeStepDistance', () => {
    it('steps only as far as needed, capped at the max', () => {
        expect(lungeStepDistance(70, 60, 20)).toBe(10);
        expect(lungeStepDistance(200, 60, 20)).toBe(20);
        expect(lungeStepDistance(40, 60, 20)).toBe(0);
    });
});

describe('StepLungeBehaviour', () => {
    it('steps toward the step\'s own aim, ending at the full distance', () => {
        const caster = run({ type: 'pixel', position: { x: 0, y: -300 } }, [0.5, 1]);
        expect(caster.x).toBeCloseTo(0);
        expect(caster.y).toBeCloseTo(-LUNGE.distance);
    });

    it('interpolates over the window', () => {
        const caster = run({ type: 'pixel', position: { x: 300, y: 0 } }, [0.5]);
        expect(caster.x).toBeCloseTo(LUNGE.distance / 2);
    });

    it('prefers the step\'s clicked aim over its locked unit', () => {
        const target: ResolvedTarget = { type: 'unit', unitId: 'gone', stepAim: { x: -300, y: 0 } };
        const caster = run(target, [1]);
        expect(caster.x).toBeCloseTo(-LUNGE.distance);
    });

    it('does not step when the target is already within reach', () => {
        const caster = run({ type: 'pixel', position: { x: 0, y: -40 } }, [1]);
        expect(caster.x).toBe(0);
        expect(caster.y).toBe(0);
    });

    it('stops where it is when the cast is interrupted', () => {
        const caster = run({ type: 'pixel', position: { x: 300, y: 0 } }, [0.5, 1], 0);
        expect(caster.x).toBeCloseTo(LUNGE.distance / 2);
    });
});

describe('getEffectiveCastBehaviours with a step lunge', () => {
    it('puts the lunge first, over its duration, ahead of the interval\'s own behaviours', () => {
        const strike = CastBehaviours.Instant(() => {});
        const interval: AbilityTimingInterval = {
            id: 'strike',
            start: 0.2,
            end: 0.4,
            abilityPhase: AbilityPhase.Active,
            targetDef: { kind: 'select', label: 'Strike', hitbox: nullHitbox, filter: 'enemy', lunge: LUNGE },
            castBehaviours: [{ timingStart: 'start', behaviour: strike }],
        };
        const entries = getEffectiveCastBehaviours(interval)!;
        expect(entries).toHaveLength(2);
        expect(entries[0]!.behaviour).toBeInstanceOf(StepLungeBehaviour);
        expect(entries[0]!.timingEnd).toBe(LUNGE.duration);
        expect(entries[1]!.behaviour).toBe(strike);
        // Stable across calls (payload keys are per index).
        expect(getEffectiveCastBehaviours(interval)![0]!.behaviour).toBe(entries[0]!.behaviour);
    });
});

describe('select steps resolve from their own lunge', () => {
    const lineHitbox = meleeLineHitbox(30, 20); // maxRange 50 (incl. unit radius)
    const step = (label: string, lunge?: { distance: number; duration: number }): SelectTargetDef => ({
        kind: 'select', label, hitbox: lineHitbox, filter: 'enemy', ...(lunge ? { lunge } : {}),
    });
    const withSteps = (lunge: AbilityStatic['lunge'], ...steps: SelectTargetDef[]) => ({
        id: 'test',
        lunge,
        abilityTimings: steps.map((targetDef, i) => ({
            id: `s${i}`, start: i * 0.2, end: i * 0.2 + 0.1, abilityPhase: AbilityPhase.Active, targetDef,
        })),
    }) as unknown as AbilityStatic;

    it('uses a step\'s own lunge, and the windup lunge only for the first step', () => {
        const caster = makeCaster();
        const first = step('First');
        const second = step('Second');
        const third = step('Third', LUNGE);
        const ability = withSteps({ distance: 30 }, first, second, third);
        expect(getSelectStepLungeDistance(ability, caster, first, engine)).toBe(30);
        expect(getSelectStepLungeDistance(ability, caster, second, engine)).toBeNull();
        expect(getSelectStepLungeDistance(ability, caster, third, engine)).toBe(LUNGE.distance);
    });

    it('locks on to an enemy only reachable after the step\'s lunge', () => {
        const caster = makeCaster();
        const enemy = new Unit({
            id: 'enemy', x: 95, y: 0, hp: 100, maxHp: 100, speed: 100,
            teamId: 'enemy' as TeamId, ownerId: 'ai', characterId: 'enemy', name: 'Enemy',
        });
        const lockEngine = { units: [caster, enemy], getUnit: () => undefined, terrainManager: null };
        const noLunge = step('Plain');
        const lunging = step('Lunging', LUNGE);
        const ability = withSteps(undefined, noLunge, lunging);
        const aim = { x: 95, y: 0 };
        expect(resolveSelectTargetLockOnCandidates(ability, caster, noLunge, aim, lockEngine)).toEqual([]);
        expect(resolveSelectTargetLockOnCandidates(ability, caster, lunging, aim, lockEngine).map((u) => u.id)).toEqual(['enemy']);
    });
});
