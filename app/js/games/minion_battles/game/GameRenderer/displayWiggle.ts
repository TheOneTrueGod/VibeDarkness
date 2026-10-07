/**
 * DisplayWiggle - purely local, display-only sprite jitter (e.g. Displacer clones).
 *
 * The offset slowly eases toward a random point inside `radius`; on arrival it pauses briefly,
 * then picks a new point. It is driven by real (renderer frame) time, so it keeps moving while the
 * game is paused. It never touches engine state or serialization and is deliberately NOT
 * synchronised between clients: each client owns its own instance and RNG.
 */

export interface DisplayWiggleOptions {
    /** Travel speed in px/s used to size each eased segment (slow by design). */
    speed?: number;
    /** Pause at each reached point, seconds. */
    pauseSec?: { min: number; max: number };
    /** Lower bound on a segment's duration (seconds) so short hops are not jerky. */
    minSegmentSec?: number;
}

/** Default wiggle travel speed in px/s. */
export const DISPLAY_WIGGLE_SPEED = 10;
export const DISPLAY_WIGGLE_PAUSE_SEC = { min: 0.2, max: 0.8 } as const;
export const DISPLAY_WIGGLE_MIN_SEGMENT_SEC = 0.4;

function smoothstep(t: number): number {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
}

export class DisplayWiggle {
    /** Current display offset (px) to add to the unit's drawn position. */
    offsetX = 0;
    offsetY = 0;

    private fromX = 0;
    private fromY = 0;
    private toX = 0;
    private toY = 0;
    private segmentDuration = 0;
    private segmentElapsed = 0;
    private pauseRemaining = 0;
    private readonly speed: number;
    private readonly pause: { min: number; max: number };
    private readonly minSegmentSec: number;

    /**
     * @param radius Max distance (px) of the offset from the true position.
     * @param rand   Uniform [0, 1) source. Defaults to `Math.random` (local, unsynchronised).
     */
    constructor(
        private readonly radius: number,
        private readonly rand: () => number = Math.random,
        opts: DisplayWiggleOptions = {},
    ) {
        this.speed = opts.speed ?? DISPLAY_WIGGLE_SPEED;
        this.pause = opts.pauseSec ?? DISPLAY_WIGGLE_PAUSE_SEC;
        this.minSegmentSec = opts.minSegmentSec ?? DISPLAY_WIGGLE_MIN_SEGMENT_SEC;
        this.pickNextTarget();
    }

    private pickNextTarget(): void {
        this.fromX = this.offsetX;
        this.fromY = this.offsetY;
        // Uniform over the disc.
        const angle = this.rand() * Math.PI * 2;
        const r = Math.sqrt(this.rand()) * this.radius;
        this.toX = Math.cos(angle) * r;
        this.toY = Math.sin(angle) * r;
        const dist = Math.hypot(this.toX - this.fromX, this.toY - this.fromY);
        this.segmentDuration = Math.max(this.minSegmentSec, this.speed > 0 ? dist / this.speed : this.minSegmentSec);
        this.segmentElapsed = 0;
    }

    /** Advance by `dtSeconds` of real time. Safe to call with 0 or large (clamped by the caller) steps. */
    update(dtSeconds: number): void {
        if (this.radius <= 0 || dtSeconds <= 0) return;
        let remaining = dtSeconds;
        // A large dt can cross several phases; the loop is bounded by progress each iteration.
        for (let guard = 0; guard < 8 && remaining > 0; guard++) {
            if (this.pauseRemaining > 0) {
                const used = Math.min(remaining, this.pauseRemaining);
                this.pauseRemaining -= used;
                remaining -= used;
                if (this.pauseRemaining <= 0) this.pickNextTarget();
                continue;
            }
            const left = this.segmentDuration - this.segmentElapsed;
            const used = Math.min(remaining, left);
            this.segmentElapsed += used;
            remaining -= used;
            const e = smoothstep(this.segmentElapsed / this.segmentDuration);
            this.offsetX = this.fromX + (this.toX - this.fromX) * e;
            this.offsetY = this.fromY + (this.toY - this.fromY) * e;
            if (this.segmentElapsed >= this.segmentDuration) {
                this.offsetX = this.toX;
                this.offsetY = this.toY;
                this.pauseRemaining = this.pause.min + this.rand() * (this.pause.max - this.pause.min);
            }
        }
    }

    /** True while holding at a reached point. */
    get isPaused(): boolean {
        return this.pauseRemaining > 0;
    }
}
