import type { CastBehaviour, CastBehaviourRenderContext } from '../castBehaviourTypes';

export interface CasterSplitFlickerConfig {
    /** Distance (px) of each copy from the caster's centre at the end of the window. Starts at 0. */
    maxSeparationPx: number;
    /** Flicker frames per second of game time; each frame shows the copy on the other side. */
    framesPerSecond: number;
}

/**
 * Render-only "splitting" wind-up: the caster's sprite flickers between two copies that drift apart over
 * the window, one frame left of centre, the next right (centred at the start, `maxSeparationPx` apart at
 * the end). A pure function of game time, so previews and committed runs render the same frames.
 * Use `CastBehaviours.CasterSplitFlicker(...)`.
 */
export class CasterSplitFlickerBehaviour implements CastBehaviour {
    private readonly config: CasterSplitFlickerConfig;

    constructor(config: CasterSplitFlickerConfig) {
        this.config = config;
    }

    getCasterRenderOffset(ctx: CastBehaviourRenderContext): { x: number; y: number } {
        return { x: casterSplitFlickerOffsetX(this.config, ctx.gameTime, ctx.windowProgress), y: 0 };
    }
}

/** Horizontal offset of the shown copy: alternates sides each frame, separation grows with `progress` (0..1). */
export function casterSplitFlickerOffsetX(config: CasterSplitFlickerConfig, gameTime: number, progress: number): number {
    const frame = Math.floor(gameTime * config.framesPerSecond);
    const side = frame % 2 === 0 ? 1 : -1;
    return side * config.maxSeparationPx * Math.max(0, Math.min(1, progress));
}
