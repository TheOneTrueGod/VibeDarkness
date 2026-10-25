import type { CastBehaviour, CastBehaviourTickContext } from '../castBehaviourTypes';

export interface LeapPoint {
    x: number;
    y: number;
}

export interface LeapConfig {
    /**
     * Where to land, resolved when the leap launches. Return `null` to skip the leap entirely (no
     * flight, no hooks). Typically read from `ctx.castPayload` (resolved at cast start so every
     * client agrees) or from `ctx.target`.
     */
    destination: (ctx: CastBehaviourTickContext) => LeapPoint | null;
    /** Seconds of airborne flight (constant speed, straight line). Match the timing window's length. */
    airTimeSec: number;
    /** Fly over rocks and walls (default true). */
    passThroughTerrain?: boolean;
    /** Fires on takeoff, before the caster is launched. */
    onLaunch?: (ctx: CastBehaviourTickContext, destination: LeapPoint) => void;
    /** Fires on landing, after the caster has been snapped onto the destination. */
    onLand?: (ctx: CastBehaviourTickContext, destination: LeapPoint) => void;
}

/** Serialized with the active ability (plain JSON): the resolved destination and whether takeoff happened. */
interface LeapPayload {
    launched: boolean;
    dest: LeapPoint | null;
}

/**
 * Airborne travel to a point, with takeoff and landing hooks. Attach it to a sustained window
 * (`timingStart: 'start', timingEnd: 'end'`): the first tick launches the caster through the
 * knockback airborne mechanism (straight line, constant speed, arc and shadow rendering), and the
 * last tick lands it exactly on the destination (cancelling any leftover airborne state) and fires
 * `onLand`. Interrupting the cast mid-flight leaves the caster airborne to land where physics puts it.
 *
 * Reusable for boss leaps, movement supers and dismounts: it holds no ability knowledge.
 *
 * Usage:
 *   castBehaviours: [{ timingStart: 'start', timingEnd: 'end', behaviour: new LeapBehaviour({ ... }) }]
 */
export class LeapBehaviour implements CastBehaviour {
    constructor(private readonly config: LeapConfig) {}

    onTick(ctx: CastBehaviourTickContext): void {
        let payload = ctx.behaviourPayload as LeapPayload | undefined;
        if (!payload) {
            payload = { launched: false, dest: this.config.destination(ctx) };
            ctx.setBehaviourPayload(payload);
        }
        const dest = payload.dest;
        if (!dest) return;

        // Launch on the first tick this behaviour runs (robust to a tick landing exactly on the window start).
        if (!payload.launched) {
            ctx.setBehaviourPayload({ ...payload, launched: true });
            this.config.onLaunch?.(ctx, dest);
            ctx.caster.applyKnockback(
                {
                    knockbackVector: { x: dest.x - ctx.caster.x, y: dest.y - ctx.caster.y },
                    knockbackAirTime: this.config.airTimeSec,
                    knockbackSlideTime: 0,
                    knockbackSource: { unitId: ctx.caster.id, abilityId: ctx.abilityId },
                    passThroughTerrain: this.config.passThroughTerrain ?? true,
                },
                ctx.engine.eventBus,
            );
        }

        if (ctx.isLastTick) {
            const { caster } = ctx;
            caster.knockback = null;
            caster.x = dest.x;
            caster.y = dest.y;
            caster.clearMovement();
            this.config.onLand?.(ctx, dest);
        }
    }
}

export function Leap(config: LeapConfig): LeapBehaviour {
    return new LeapBehaviour(config);
}
