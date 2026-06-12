import type {
    CastBehaviour,
    CastBehaviourTickContext,
} from '../castBehaviourTypes';

/**
 * Fires a callback exactly once when the timing window is entered (first tick).
 * Replaces the `if (prevTime > 0) return` / tick-crossing gate pattern in doCardEffect.
 *
 * Usage:
 *   behaviour: CastBehaviours.Instant((ctx) => { ... })
 */
export class InstantBehaviour implements CastBehaviour {
    private readonly _fn: (ctx: CastBehaviourTickContext) => void;

    constructor(fn: (ctx: CastBehaviourTickContext) => void) {
        this._fn = fn;
    }

    onTick(ctx: CastBehaviourTickContext): void {
        if (!ctx.isFirstTick) return;
        this._fn(ctx);
    }
}
