import type { CastBehaviour, CastBehaviourSetupContext } from '../castBehaviourTypes';
import { spawnSpellCircle, type SpellCircleSpec } from '../../game/spellCircles/spellCircles';

export interface SpellCircleBehaviourConfig extends SpellCircleSpec {
    /**
     * Owner-local seconds until the cast lands. Default: the behaviour's window (`timingStart` to
     * `timingEnd`, or to the interval's end for a one-shot entry).
     */
    castSeconds?: number;
    /**
     * Draw the circle only when this holds at window open (e.g. only when a research node changes what
     * the cast does). Visual only: it may read anything but must not change state.
     */
    when?: (ctx: CastBehaviourSetupContext) => boolean;
}

/**
 * Draws a spell circle (`game/spellCircles/`) on the caster when its window opens. The circle lands
 * on the window's end, follows the caster, keeps the caster's pace, and fizzles if the cast is cut.
 * Visual only. Use `CastBehaviours.SpellCircle({ style: 'storm' })` on a windup interval:
 *
 *   castBehaviours: [{ timingStart: 'start', timingEnd: 'end', behaviour: CastBehaviours.SpellCircle({ style: 'earth' }) }]
 */
export class SpellCircleBehaviour implements CastBehaviour {
    readonly config: SpellCircleBehaviourConfig;

    constructor(config: SpellCircleBehaviourConfig) {
        this.config = config;
    }

    onSetup(ctx: CastBehaviourSetupContext): void {
        const { castSeconds, when, ...spec } = this.config;
        if (when && !when(ctx)) return;
        const seconds = castSeconds ?? ctx.windowSeconds ?? 0;
        if (seconds <= 0) return;
        spawnSpellCircle(ctx.engine, ctx.caster, spec, { castSeconds: seconds, abilityId: ctx.abilityId });
    }
}
