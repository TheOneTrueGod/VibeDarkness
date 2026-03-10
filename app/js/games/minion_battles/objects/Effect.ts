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
    /** Optional radius for size-dependent effects (e.g. bite). */
    effectRadius?: number;
    /** When set, effect travels from (startX, startY) to (endX, endY) over its duration. */
    private startX?: number;
    private endX: number;
    private startY?: number;
    private endY: number;
    /** Optional payload for effect-type-specific data (e.g. CorruptionOrb target, CorruptionProgressBar progress). */
    effectData: Record<string, unknown> = {};

    constructor(config: {
        id?: string;
        x: number;
        y: number;
        duration: number;
        effectType: string;
        /** Start position for traveling effects (e.g. bash). */
        startX?: number;
        startY?: number;
        /** Optional radius for size-dependent effects (e.g. bite). */
        effectRadius?: number;
        /** Optional payload for effect-type-specific state. */
        effectData?: Record<string, unknown>;
    }) {
        super(config.id ?? generateGameObjectId('fx'), config.x, config.y);
        this.duration = config.duration;
        this.effectType = config.effectType;
        this.effectRadius = config.effectRadius;
        this.endX = config.x;
        this.endY = config.y;
        this.startX = config.startX;
        this.startY = config.startY;
        if (config.effectData) this.effectData = { ...config.effectData };
    }

    update(dt: number, engine: unknown): void {
        if (!this.active) return;
        this.elapsed += dt;
        // TorchProjectile: when it reaches the target, spawn the ground Torch effect then deactivate
        if (this.effectType === 'TorchProjectile' && this.elapsed >= this.duration) {
            const data = this.effectData as {
                roundCreated?: number;
                initialLightAmount?: number;
                initialRadius?: number;
                roundsTotal?: number;
            };
            const roundCreated = data.roundCreated ?? 1;
            const initialLightAmount = data.initialLightAmount ?? 10;
            const initialRadius = data.initialRadius ?? 5;
            const roundsTotal = data.roundsTotal ?? 3;
            const torchEffect = new Effect({
                x: this.endX,
                y: this.endY,
                duration: 999,
                effectType: 'Torch',
                effectData: {
                    roundCreated,
                    initialLightAmount,
                    initialRadius,
                    lightAmount: initialLightAmount,
                    radius: initialRadius,
                    roundsTotal,
                },
            });
            (engine as { addEffect(e: Effect): void }).addEffect(torchEffect);
            this.active = false;
            return;
        }
        if (this.elapsed >= this.duration) {
            this.active = false;
        }
        // CorruptionOrb: phase 0 = straight for ~10 ticks, then phase 1 = arc to target
        if (this.effectType === 'CorruptionOrb') {
            const data = this.effectData as {
                targetX: number;
                targetY: number;
                phase: number;
                phase0Elapsed: number;
                dirX: number;
                dirY: number;
            };
            const straightDuration = 10 / 60;
            const speed0 = 120;
            const speed1 = 280;
            if (data.phase === 0) {
                data.phase0Elapsed = (data.phase0Elapsed ?? 0) + dt;
                this.x += (data.dirX ?? 0) * speed0 * dt;
                this.y += (data.dirY ?? 0) * speed0 * dt;
                if (data.phase0Elapsed >= straightDuration) {
                    data.phase = 1;
                }
            } else {
                const dx = data.targetX - this.x;
                const dy = data.targetY - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 6) {
                    this.active = false;
                    return;
                }
                const step = Math.min(speed1 * dt, dist);
                this.x += (dx / dist) * step;
                this.y += (dy / dist) * step;
            }
            return;
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
        if (Object.keys(this.effectData).length > 0) out.effectData = { ...this.effectData };
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
        if (data.effectRadius != null) config.effectRadius = data.effectRadius as number;
        if (data.effectData != null) config.effectData = data.effectData as Record<string, unknown>;
        const effect = new Effect(config);
        effect.active = data.active as boolean;
        effect.elapsed = data.elapsed as number;
        return effect;
    }
}
