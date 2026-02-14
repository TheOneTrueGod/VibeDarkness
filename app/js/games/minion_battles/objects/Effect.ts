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

    constructor(config: {
        id?: string;
        x: number;
        y: number;
        duration: number;
        effectType: string;
    }) {
        super(config.id ?? generateGameObjectId('fx'), config.x, config.y);
        this.duration = config.duration;
        this.effectType = config.effectType;
    }

    update(dt: number, _engine: unknown): void {
        if (!this.active) return;
        this.elapsed += dt;
        if (this.elapsed >= this.duration) {
            this.active = false;
        }
    }

    /** Progress 0..1 through the effect's lifetime. */
    get progress(): number {
        return Math.min(1, this.elapsed / this.duration);
    }

    toJSON(): Record<string, unknown> {
        return {
            _type: 'effect',
            id: this.id,
            x: this.x,
            y: this.y,
            active: this.active,
            duration: this.duration,
            elapsed: this.elapsed,
            effectType: this.effectType,
        };
    }

    static fromJSON(data: Record<string, unknown>): Effect {
        const effect = new Effect({
            id: data.id as string,
            x: data.x as number,
            y: data.y as number,
            duration: data.duration as number,
            effectType: data.effectType as string,
        });
        effect.active = data.active as boolean;
        effect.elapsed = data.elapsed as number;
        return effect;
    }
}
