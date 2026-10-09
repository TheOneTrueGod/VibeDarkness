import type {
    CastBehaviour,
    CastBehaviourTickContext,
} from '../castBehaviourTypes';

export interface InstantOptions {
    /**
     * When the callback fires. `'start'` (default) fires once on the first tick of the window.
     * `'end'` fires once on the last tick, which is the window exit for a sustained window or the
     * entry tick for a one-shot entry.
     */
    at?: 'start' | 'end';
}

/**
 * Fires a callback exactly once when the timing window is entered (first tick), or when it ends
 * (last tick) with `{ at: 'end' }`. Replaces the `if (prevTime > 0) return` / tick-crossing gate
 * pattern in doCardEffect.
 *
 * Usage:
 *   behaviour: CastBehaviours.Instant((ctx) => { ... })
 *   behaviour: CastBehaviours.Instant((ctx) => { ... }, { at: 'end' })
 */
export class InstantBehaviour implements CastBehaviour {
    private readonly _fn: (ctx: CastBehaviourTickContext) => void;
    private readonly _at: 'start' | 'end';

    constructor(fn: (ctx: CastBehaviourTickContext) => void, opts?: InstantOptions) {
        this._fn = fn;
        this._at = opts?.at ?? 'start';
    }

    onTick(ctx: CastBehaviourTickContext): void {
        if (this._at === 'end' ? !ctx.isLastTick : !ctx.isFirstTick) return;
        this._fn(ctx);
    }
}
