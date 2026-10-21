/**
 * Step lunge: a physical step the caster takes toward one select step's own target, at the start of
 * that step's interval (`SelectTargetDef.lunge`). The per-step counterpart of the ability-level
 * windup lunge (`WindupLunge.ts`), for multi-strike abilities where each strike closes distance on
 * its own (e.g. Bloody Claws). Not the drawn slide (`MeleeAttack.withSlide`), which never moves the
 * caster.
 *
 * Same rules as the windup lunge: step toward the step's clicked aim (`stepAim`), its ground pick,
 * or its locked unit; only as far as needed to bring the target within the step's hitbox reach
 * (`lungeStepDistance`); interpolated over `duration`. The engine adds the behaviour to the step's
 * interval automatically (`getEffectiveCastBehaviours`), so the select def is the single source.
 */

import type { CastBehaviour, CastBehaviourSetupContext, CastBehaviourTickContext, CastBehaviourInterruptContext } from './castBehaviourTypes';
import type { SelectTargetDef } from './timingTargetDef';
import type { ResolvedTarget } from '../game/types';

/** See `SelectTargetDef.lunge`. */
export interface SelectStepLunge {
    /** Max step (px) before terrain/research modifiers (`Unit.getLungeDistance`). */
    distance: number;
    /** Seconds from the step's interval start over which the step happens (end it by the impact). */
    duration: number;
}

/**
 * How far a lunge actually travels: just enough to bring a target `distToTarget` away within
 * `reach`, never more than `maxDistance`.
 */
export function lungeStepDistance(distToTarget: number, reach: number, maxDistance: number): number {
    return Math.min(maxDistance, Math.max(0, distToTarget - reach));
}

/** Where a lunge for this step heads: its clicked aim, its ground pick, else its locked unit. */
export function stepLungeTargetPoint(
    target: ResolvedTarget,
    engine: { getUnit(id: string): { x: number; y: number } | undefined | null },
): { x: number; y: number } | null {
    if (target.stepAim) return target.stepAim;
    if (target.type === 'pixel' && target.position) return target.position;
    if (target.type === 'unit' && target.unitId) {
        const unit = engine.getUnit(target.unitId);
        return unit ? { x: unit.x, y: unit.y } : null;
    }
    return null;
}

/** Plain JSON so it survives cast snapshots. */
interface StepLungePayload {
    startX: number;
    startY: number;
    dirX: number;
    dirY: number;
    /** Committed travel (px); 0 = no step. */
    distance: number;
    stopped: boolean;
}

export class StepLungeBehaviour implements CastBehaviour {
    /** A locked unit past the ability's range is still the step's target (see the setup). */
    readonly keepsUnitTargetsBeyondRange = true;

    constructor(
        private readonly lunge: SelectStepLunge,
        /** The step's hitbox reach: the lunge stops once the target is this close. */
        private readonly reach: number,
    ) {}

    onSetup(ctx: CastBehaviourSetupContext): void {
        const point = stepLungeTargetPoint(ctx.target, ctx.engine);
        const caster = ctx.caster;
        const dx = point ? point.x - caster.x : 0;
        const dy = point ? point.y - caster.y : 0;
        const dist = Math.hypot(dx, dy);
        const maxDistance = caster.getLungeDistance(ctx.engine, this.lunge.distance);
        const payload: StepLungePayload = {
            startX: caster.x,
            startY: caster.y,
            dirX: dist > 0 ? dx / dist : 0,
            dirY: dist > 0 ? dy / dist : 0,
            distance: dist > 0 ? lungeStepDistance(dist, this.reach, maxDistance) : 0,
            stopped: false,
        };
        ctx.setBehaviourPayload(payload);
    }

    onTick(ctx: CastBehaviourTickContext): void {
        const payload = ctx.behaviourPayload as StepLungePayload | undefined;
        if (!payload || payload.stopped || payload.distance <= 0) return;
        const travelled = payload.distance * ctx.windowProgress;
        ctx.caster.x = payload.startX + payload.dirX * travelled;
        ctx.caster.y = payload.startY + payload.dirY * travelled;
        ctx.caster.invalidateMovementPath();
        ctx.caster.claimAbilityMovement();
    }

    onInterrupt(ctx: CastBehaviourInterruptContext): void {
        const payload = ctx.behaviourPayload as StepLungePayload | undefined;
        if (payload) ctx.setBehaviourPayload({ ...payload, stopped: true });
    }
}

const behaviourCache = new WeakMap<SelectTargetDef, StepLungeBehaviour>();

/** The (cached, stateless) step-lunge behaviour for a select step with `lunge`, else null. */
export function getStepLungeBehaviour(selectDef: SelectTargetDef): StepLungeBehaviour | null {
    if (!selectDef.lunge) return null;
    let behaviour = behaviourCache.get(selectDef);
    if (!behaviour) {
        behaviour = new StepLungeBehaviour(selectDef.lunge, selectDef.hitbox.maxRange);
        behaviourCache.set(selectDef, behaviour);
    }
    return behaviour;
}
