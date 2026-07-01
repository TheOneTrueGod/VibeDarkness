/**
 * Effect - Visual-only game object with a duration.
 *
 * Used for impact effects, glows, particle bursts, etc.
 * The renderer picks the visual based on `effectType`.
 */

import { GameObject, generateGameObjectId } from '../GameObject';
import { computeDamageNumberWorldPosition, type DamageNumberMotionData } from './damageNumberMotion';
import type { EffectProperties } from './effectProperties';

export class Effect extends GameObject {
    /** Total duration in seconds. */
    duration: number;
    /** Optional delay before effect starts (progress stays 0 until elapsed >= delay). */
    delay?: number;
    /** Elapsed time in seconds. */
    elapsed: number = 0;
    /** String key the renderer uses to decide how to draw this effect. */
    effectType: string;
    /** Optional radius for size-dependent effects (e.g. bite). */
    effectRadius?: number;
    /** Typed per-instance visual properties; read by the effect def for rendering. */
    effectProperties?: EffectProperties;
    /** When set, effect travels from (startX, startY) to (endX, endY) over its duration. */
    private startX?: number;
    private endX: number;
    private startY?: number;
    private endY: number;
    /** Optional payload for effect-type-specific data (e.g. CorruptionOrb target position, ParticleImage velocity). */
    effectData: Record<string, unknown> = {};

    constructor(config: {
        id?: string;
        x: number;
        y: number;
        duration: number;
        effectType: string;
        /** Start position for traveling effects (e.g. punch). */
        startX?: number;
        startY?: number;
        /** Optional radius for size-dependent effects (e.g. bite). */
        effectRadius?: number;
        /** Typed per-instance visual properties; read by the effect def for rendering. */
        effectProperties?: EffectProperties;
        /** Optional payload for effect-type-specific state. */
        effectData?: Record<string, unknown>;
        /** Optional delay before effect starts. */
        delay?: number;
    }) {
        super(config.id ?? generateGameObjectId('fx'), config.x, config.y);
        this.duration = config.duration;
        this.delay = config.delay;
        this.effectType = config.effectType;
        this.effectRadius = config.effectRadius;
        if (config.effectProperties) this.effectProperties = config.effectProperties;
        this.endX = config.x;
        this.endY = config.y;
        this.startX = config.startX;
        this.startY = config.startY;
        if (config.effectData) this.effectData = { ...config.effectData };
    }

    /**
     * Advance visual state — runs every render frame for purely visual effects.
     * Does NOT access engine context.
     */
    renderUpdate(realDt: number): void {
        if (!this.active) return;
        this.elapsed += realDt;

        // ParticleImage / RockChipParticle / SpriteEffect: velocity + optional acceleration and damping
        if (this.effectType === 'ParticleImage' || this.effectType === 'RockChipParticle' || this.effectType === 'SpriteEffect') {
            const data = this.effectData as { vx?: number; vy?: number; ay?: number; dampingK?: number };
            let vx = data.vx ?? 0;
            let vy = data.vy ?? 0;
            vy += (data.ay ?? 0) * realDt;
            this.x += vx * realDt;
            this.y += vy * realDt;
            const dampingK = data.dampingK ?? 8;
            const factor = Math.exp(-dampingK * realDt);
            data.vx = vx * factor;
            data.vy = vy * factor;
        }
        // Afterimage: optional drift when unit was standing still (no damping; constant drift)
        if (this.effectType === 'Afterimage') {
            const data = this.effectData as { vx?: number; vy?: number };
            const vx = data.vx ?? 0;
            const vy = data.vy ?? 0;
            this.x += vx * realDt;
            this.y += vy * realDt;
        }
        // StackGhost: drifts up and sideways with light damping
        if (this.effectType === 'StackGhost') {
            const data = this.effectData as { vx?: number; vy?: number };
            let vx = data.vx ?? 0;
            let vy = data.vy ?? 0;
            this.x += vx * realDt;
            this.y += vy * realDt;
            const dampingK = 2;
            const factor = Math.exp(-dampingK * realDt);
            data.vx = vx * factor;
            data.vy = vy * factor;
        }
        // DamageNumber / FloatingText: parabolic path + ease-out (see damageNumberMotion)
        if (this.effectType === 'DamageNumber' || this.effectType === 'FloatingText') {
            const pos = computeDamageNumberWorldPosition(this.effectData as Partial<DamageNumberMotionData>, this.progress);
            this.x = pos.x;
            this.y = pos.y;
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
                data.phase0Elapsed = (data.phase0Elapsed ?? 0) + realDt;
                this.x += (data.dirX ?? 0) * speed0 * realDt;
                this.y += (data.dirY ?? 0) * speed0 * realDt;
                if (data.phase0Elapsed >= straightDuration) {
                    data.phase = 1;
                }
                // Do not fall through to expiry check — CorruptionOrb uses dist check instead
                return;
            } else {
                const dx = data.targetX - this.x;
                const dy = data.targetY - this.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 6) {
                    this.active = false;
                    return;
                }
                const step = Math.min(speed1 * realDt, dist);
                this.x += (dx / dist) * step;
                this.y += (dy / dist) * step;
                return;
            }
        }
        // LanterniteConstParticle: quadratic bezier arc from scout to nest build site
        if (this.effectType === 'LanterniteConstParticle') {
            const data = this.effectData as {
                startX: number;
                startY: number;
                controlX: number;
                controlY: number;
                endX: number;
                endY: number;
            };
            const t = this.progress;
            const mt = 1 - t;
            this.x = mt * mt * data.startX + 2 * mt * t * data.controlX + t * t * data.endX;
            this.y = mt * mt * data.startY + 2 * mt * t * data.controlY + t * t * data.endY;
        }
        // Traveling effect: interpolate position from start to end
        if (this.startX !== undefined && this.startY !== undefined && this.effectType !== 'DamageNumber') {
            const t = this.progress;
            this.x = this.startX + (this.endX - this.startX) * t;
            this.y = this.startY + (this.endY - this.startY) * t;
        }
        // TorchProjectile: lifetime tracked in fixed ticks by EffectManager.gameUpdate; don't expire here via renderUpdate
        if (this.effectType === 'TorchProjectile') {
            return;
        }
        // Expiry check (TorchProjectile handled above)
        const totalDuration = (this.delay ?? 0) + this.duration;
        if (this.elapsed >= totalDuration) {
            this.active = false;
        }
    }

    /** Progress 0..1 through the effect's lifetime (0 until delay elapses if set). */
    get progress(): number {
        if (this.delay !== undefined && this.elapsed < this.delay) return 0;
        const start = this.delay ?? 0;
        return Math.min(1, (this.elapsed - start) / this.duration);
    }

}
