import type {
    CastBehaviour,
    CastBehaviourBaseContext,
    CastBehaviourRenderContext,
    CastBehaviourSetupContext,
} from '../castBehaviourTypes';
import { easeInOutQuad, easeOutCubic } from '../easing';

/**
 * Signed slide distance (px) along the slide direction at `windowProgress`.
 *
 * Before `impactAt` the caster eases out to `+forwardDistance`. After it, the caster eases back
 * from `+forwardDistance` to `-backwardDistance` at the end of the window. Starting the back phase
 * at `+forwardDistance` keeps the offset continuous at impact, even when `impactAt` is 0.
 */
export function casterSlideMagnitude(
    windowProgress: number,
    impactAt: number,
    forwardDistance: number,
    backwardDistance: number,
): number {
    if (windowProgress <= impactAt) {
        const t = impactAt > 0 ? windowProgress / impactAt : 1;
        return easeOutCubic(t) * forwardDistance;
    }
    const remaining = 1 - impactAt;
    const t = remaining > 0 ? (windowProgress - impactAt) / remaining : 1;
    const totalSlide = forwardDistance + backwardDistance;
    return forwardDistance - easeInOutQuad(t) * totalSlide;
}

export interface CasterSlideConfig {
    forwardDistance: number;
    backwardDistance: number;
    /** Window progress (0..1) at which the caster is at its forward position (impact). */
    impactAt: number;
    /**
     * World-space unit direction to slide along. Returning null skips the slide. Evaluated once when
     * the window opens; later frames reuse that direction, so the caster moving mid-window cannot flip it.
     */
    direction: (ctx: CastBehaviourBaseContext) => { x: number; y: number } | null;
}

/** Plain JSON so it survives cast snapshots. `x`/`y` are null when the direction resolved to nothing. */
interface CasterSlidePayload {
    x: number | null;
    y: number | null;
}

/**
 * Render-only lunge: offsets the caster along `direction` over its window. Has no gameplay effect.
 * Use `CastBehaviours.CasterSlide(...)`.
 */
export class CasterSlideBehaviour implements CastBehaviour {
    private readonly config: CasterSlideConfig;

    constructor(config: CasterSlideConfig) {
        this.config = config;
    }

    /** Captures the slide direction when the window opens. */
    onSetup(ctx: CastBehaviourSetupContext): void {
        const dir = this.config.direction(ctx);
        const payload: CasterSlidePayload = dir ? { x: dir.x, y: dir.y } : { x: null, y: null };
        ctx.setBehaviourPayload(payload);
    }

    getCasterRenderOffset(ctx: CastBehaviourRenderContext): { x: number; y: number } | null {
        // Use the direction captured at setup. Without one (window not opened yet, e.g. a preview),
        // resolve it live.
        const captured = ctx.behaviourPayload as CasterSlidePayload | undefined;
        const dir = captured
            ? (captured.x !== null && captured.y !== null ? { x: captured.x, y: captured.y } : null)
            : this.config.direction(ctx);
        if (!dir) return null;
        const magnitude = casterSlideMagnitude(
            ctx.windowProgress,
            this.config.impactAt,
            this.config.forwardDistance,
            this.config.backwardDistance,
        );
        return { x: dir.x * magnitude, y: dir.y * magnitude };
    }
}
