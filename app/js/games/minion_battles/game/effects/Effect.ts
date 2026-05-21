/**
 * Effect - Visual-only game object with a duration.
 *
 * Used for impact effects, glows, particle bursts, etc.
 * The renderer picks the visual based on `effectType`.
 */

import { GameObject, generateGameObjectId } from '../GameObject';
import { computeDamageNumberWorldPosition, type DamageNumberMotionData } from './damageNumberMotion';
import type { Unit } from '../units/Unit';

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
        this.endX = config.x;
        this.endY = config.y;
        this.startX = config.startX;
        this.startY = config.startY;
        if (config.effectData) this.effectData = { ...config.effectData };
    }

    /**
     * True for effects that need engine context in their update — these remain on the game tick
     * and are skipped by renderUpdate(). Transitional flag for Phase 3 migration.
     */
    isGameDriven(): boolean {
        return (
            this.effectType === 'AlphaWolfStoryController' ||
            this.effectType === 'StoryHomingParticle'
        );
    }

    /**
     * Advance visual state — runs every render frame for purely visual effects.
     * Skipped for game-driven effects (isGameDriven() === true).
     * Does NOT access engine context.
     */
    renderUpdate(realDt: number): void {
        if (!this.active) return;
        this.elapsed += realDt;

        // ParticleImage: simple 2D particle with velocity damping
        if (this.effectType === 'ParticleImage') {
            const data = this.effectData as { vx?: number; vy?: number };
            const vx = data.vx ?? 0;
            const vy = data.vy ?? 0;
            this.x += vx * realDt;
            this.y += vy * realDt;
            // Exponential decay so particles slow down quickly (matches short 0.3s lifetime).
            const dampingK = 8;
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
        // Traveling effect: interpolate position from start to end
        if (this.startX !== undefined && this.startY !== undefined && this.effectType !== 'DamageNumber') {
            const t = this.progress;
            this.x = this.startX + (this.endX - this.startX) * t;
            this.y = this.startY + (this.endY - this.startY) * t;
        }
        // TorchProjectile: flag landing for EffectManager.gameUpdate to process; don't expire here
        if (this.effectType === 'TorchProjectile') {
            if (this.elapsed >= this.duration) {
                (this.effectData as { landingPending?: boolean }).landingPending = true;
            }
            return;
        }
        // Expiry check (game-driven effects manage their own expiry in update(); TorchProjectile handled above)
        const totalDuration = (this.delay ?? 0) + this.duration;
        if (this.elapsed >= totalDuration) {
            this.active = false;
        }
    }

    /**
     * Game-tick update — runs engine-context branches for game-driven effects.
     * For game-driven effects this also advances elapsed (since renderUpdate is skipped for them).
     * For non-game-driven effects elapsed is advanced by renderUpdate(); this method is a no-op.
     */
    update(dt: number, engine: unknown): void {
        if (!this.active) return;

        // Only game-driven effects are updated here; purely visual effects are handled in renderUpdate().
        if (!this.isGameDriven()) return;

        // Advance elapsed for game-driven effects (renderUpdate won't be called for them).
        this.elapsed += dt;

        if (this.effectType === 'AlphaWolfStoryController') {
            const ctx = engine as {
                addEffect(e: Effect): void;
                units: Unit[];
            };
            const data = this.effectData as {
                radialRatePerSecond?: number;
                homingRatePerSecond?: number;
                radialRemainder?: number;
                homingRemainder?: number;
            };
            const radialPhase = this.elapsed <= 1;
            const homingPhase = this.elapsed > 1 && this.elapsed <= 3;
            const homingTargets = ctx.units.filter((u) => u.isAlive() && u.isPlayerControlled());

            if (radialPhase) {
                const total = (data.radialRatePerSecond ?? 24) * dt + (data.radialRemainder ?? 0);
                const spawnCount = Math.floor(total);
                data.radialRemainder = total - spawnCount;
                for (let i = 0; i < spawnCount; i++) {
                    const angle = Math.random() * 2 * Math.PI;
                    const speed = 120 + Math.random() * 160;
                    const vx = Math.cos(angle) * speed;
                    const vy = Math.sin(angle) * speed;
                    ctx.addEffect(
                        new Effect({
                            x: this.x,
                            y: this.y,
                            duration: 1,
                            effectType: 'ParticleImage',
                            effectData: { imageKey: 'darkBlob', vx, vy, scale: 0.7 + Math.random() * 0.5 },
                        }),
                    );
                }
            }

            if (homingPhase && homingTargets.length > 0) {
                const total = (data.homingRatePerSecond ?? 20) * dt + (data.homingRemainder ?? 0);
                const spawnCount = Math.floor(total);
                data.homingRemainder = total - spawnCount;
                for (let i = 0; i < spawnCount; i++) {
                    const idx = Math.floor(Math.random() * homingTargets.length);
                    const target = homingTargets[idx];
                    if (!target) continue;
                    const spawnAngle = Math.random() * 2 * Math.PI;
                    const spawnRadius = 16 + Math.random() * 20;
                    const sx = this.x + Math.cos(spawnAngle) * spawnRadius;
                    const sy = this.y + Math.sin(spawnAngle) * spawnRadius;
                    const mx = (sx + target.x) * 0.5 + (Math.random() * 240 - 120);
                    const my = (sy + target.y) * 0.5 - (70 + Math.random() * 80);
                    ctx.addEffect(
                        new Effect({
                            x: sx,
                            y: sy,
                            duration: 2,
                            effectType: 'StoryHomingParticle',
                            effectData: {
                                imageKey: 'darkBlob',
                                startX: sx,
                                startY: sy,
                                controlX: mx,
                                controlY: my,
                                targetUnitId: target.id,
                                targetX: target.x,
                                targetY: target.y,
                                pulseSpawned: false,
                            },
                        }),
                    );
                }
            }
        }

        if (this.effectType === 'StoryHomingParticle') {
            const ctx = engine as {
                addEffect(e: Effect): void;
                getUnit(id: string): Unit | undefined;
            };
            const data = this.effectData as {
                startX: number;
                startY: number;
                controlX: number;
                controlY: number;
                targetUnitId?: string;
                targetX: number;
                targetY: number;
                pulseSpawned?: boolean;
            };
            const t = this.progress;
            const targetUnit = data.targetUnitId ? ctx.getUnit(data.targetUnitId) : undefined;
            const tx = targetUnit?.x ?? data.targetX;
            const ty = targetUnit?.y ?? data.targetY;
            data.targetX = tx;
            data.targetY = ty;
            this.x = (1 - t) * (1 - t) * data.startX + 2 * (1 - t) * t * data.controlX + t * t * tx;
            this.y = (1 - t) * (1 - t) * data.startY + 2 * (1 - t) * t * data.controlY + t * t * ty;
            if (t >= 1 && !data.pulseSpawned) {
                data.pulseSpawned = true;
                ctx.addEffect(
                    new Effect({
                        x: tx,
                        y: ty,
                        duration: 0.45,
                        effectType: 'Pulse',
                        effectData: { colors: [0xa855f7, 0x7e22ce, 0x581c87] },
                    }),
                );
                this.active = false;
            }
            return;
        }

        // Expiry for game-driven effects
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
        if (this.delay !== undefined) out.delay = this.delay;
        return out;
    }

    static fromJSON(data: Record<string, unknown>): Effect {
        const endX = (data.endX ?? data.x) as number;
        const endY = (data.endY ?? data.y) as number;
        const config: ConstructorParameters<typeof Effect>[0] = {
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
        if (data.delay != null) config.delay = data.delay as number;
        const effect = new Effect(config);
        effect.active = data.active as boolean;
        effect.elapsed = data.elapsed as number;
        return effect;
    }
}
