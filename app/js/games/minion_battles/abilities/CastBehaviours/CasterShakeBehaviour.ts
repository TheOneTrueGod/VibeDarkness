import type { CastBehaviour, CastBehaviourRenderContext } from '../castBehaviourTypes';

export interface CasterShakeConfig {
    /** Shake amplitude (px) at the start of the window. */
    from: number;
    /** Shake amplitude (px) at the end of the window. */
    to: number;
}

/**
 * Render-only shake: the caster jitters with an amplitude ramping from `from` to `to` over its
 * window. The jitter is a pure function of game time (no Math.random), so previews and committed
 * runs render the same frames. Use `CastBehaviours.CasterShake(...)`.
 */
export class CasterShakeBehaviour implements CastBehaviour {
    private readonly config: CasterShakeConfig;

    constructor(config: CasterShakeConfig) {
        this.config = config;
    }

    getCasterRenderOffset(ctx: CastBehaviourRenderContext): { x: number; y: number } {
        const amplitude = this.config.from + (this.config.to - this.config.from) * ctx.windowProgress;
        return {
            x: Math.sin(ctx.gameTime * 90) * amplitude,
            y: Math.cos(ctx.gameTime * 110) * amplitude * 0.6,
        };
    }
}
