/**
 * Effect - Visual-only game object with a duration.
 *
 * Used for impact effects, glows, particle bursts, etc.
 * The renderer picks the visual based on `effectType`.
 */

import { GameObject, generateGameObjectId } from './GameObject';

export class Effect extends GameObject {
    /** Total duration in seconds. */
    duration: number;
    /** Elapsed time in seconds. */
    elapsed: number = 0;
    /** String key the renderer uses to decide how to draw this effect. */
    effectType: string;
    /** When set, effect travels from (startX, startY) to (endX, endY) over its duration. */
    private startX?: number;
    private startY?: number;
    private endX: number;
    private endY: number;

    constructor(config: {
        id?: string;
        x: number;
        y: number;
        duration: number;
        effectType: string;
        /** Start position for traveling effects (e.g. bash). */
        startX?: number;
        startY?: number;
    }) {
        super(config.id ?? generateGameObjectId('fx'), config.x, config.y);
        this.duration = config.duration;
        this.effectType = config.effectType;
        this.endX = config.x;
        this.endY = config.y;
        this.startX = config.startX;
        this.startY = config.startY;
    }

    update(dt: number, _engine: unknown): void {
        if (!this.active) return;
        this.elapsed += dt;
        if (this.elapsed >= this.duration) {
            this.active = false;
        }
        // Traveling effect: interpolate position from start to end
        if (this.startX !== undefined && this.startY !== undefined) {
            const t = this.progress;
            this.x = this.startX + (this.endX - this.startX) * t;
            this.y = this.startY + (this.endY - this.startY) * t;
        }
    }

    /** Progress 0..1 through the effect's lifetime. */
    get progress(): number {
        return Math.min(1, this.elapsed / this.duration);
    }

    toJSON(): Record<string, unknown> {
        const out: Record<string, unknown> = {
            _type: 'effect',
            id: this.id,
            x: this.x,
            y: this.y,
            active: this.active,
            duration: this.duration,
            elapsed: this.elapsed,
            effectType: this.effectType,
        };
        if (this.startX !== undefined) {
            out.startX = this.startX;
            out.startY = this.startY;
            out.endX = this.endX;
            out.endY = this.endY;
        }
        return out;
    }

    static fromJSON(data: Record<string, unknown>): Effect {
        const endX = (data.endX ?? data.x) as number;
        const endY = (data.endY ?? data.y) as number;
        const config: Parameters<Effect['constructor']>[0] = {
            id: data.id as string,
            x: endX,
            y: endY,
            duration: data.duration as number,
            effectType: data.effectType as string,
        };
        if (data.startX != null) config.startX = data.startX as number;
        if (data.startY != null) config.startY = data.startY as number;
        const effect = new Effect(config);
        effect.active = data.active as boolean;
        effect.elapsed = data.elapsed as number;
        return effect;
    }
}
