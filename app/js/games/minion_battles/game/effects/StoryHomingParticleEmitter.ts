/**
 * StoryHomingParticleEmitter — tracks a single homing particle along a quadratic bezier path.
 *
 * On the first game tick the emitter creates ONE StoryHomingParticle Effect with duration=DURATION.
 * Effect.renderUpdate() advances that effect's position along the bezier each render frame
 * (bezier params are stored in effectData), so the particle visually travels from wolf to player
 * over the full 2 seconds.  At completion (elapsed >= DURATION) the emitter spawns a Pulse and
 * deactivates; the long-lived Effect expires naturally via its own elapsed.
 */

import { EffectEmitter } from './EffectEmitter';
import { Effect } from './Effect';
import type { EngineContext } from '../EngineContext';

export const STORY_HOMING_PARTICLE_DEFAULT_DURATION = 2;

export class StoryHomingParticleEmitter extends EffectEmitter {
    private readonly flightDuration: number;
    private readonly particleTint: number;
    private readonly pulseColors: number[];
    private startX: number;
    private startY: number;
    private controlX: number;
    private controlY: number;
    private targetUnitId?: string;
    private targetX: number;
    private targetY: number;
    private pulseSpawned: boolean = false;
    private currentEffect: Effect | null = null;

    constructor(config: {
        id?: string;
        x: number;
        y: number;
        startX: number;
        startY: number;
        controlX: number;
        controlY: number;
        targetUnitId?: string;
        targetX: number;
        targetY: number;
        /** Flight time in seconds. Default 2 (alpha-wolf story). */
        duration?: number;
        /** Particle tint hex. Default purple story color. */
        tint?: number;
        /** Pulse colors on arrival. Default purple story palette. */
        pulseColors?: number[];
        /** Restore elapsed (used by restoreFromJSON). */
        elapsed?: number;
        pulseSpawned?: boolean;
    }) {
        const duration = config.duration ?? STORY_HOMING_PARTICLE_DEFAULT_DURATION;
        super({ id: config.id, x: config.x, y: config.y, lifetime: duration });
        this.flightDuration = duration;
        this.particleTint = config.tint ?? 0xa855f7;
        this.pulseColors = config.pulseColors ?? [0xa855f7, 0x7e22ce, 0x581c87];
        this.startX = config.startX;
        this.startY = config.startY;
        this.controlX = config.controlX;
        this.controlY = config.controlY;
        this.targetUnitId = config.targetUnitId;
        this.targetX = config.targetX;
        this.targetY = config.targetY;
        if (config.elapsed != null) this.elapsed = config.elapsed;
        if (config.pulseSpawned != null) this.pulseSpawned = config.pulseSpawned;
    }

    update(dt: number, engine: EngineContext): Effect[] {
        this.elapsed += dt;

        // Update live target position (units don't move during story pause, but keep tracking for correctness).
        const targetUnit = this.targetUnitId ? engine.getUnit(this.targetUnitId) : undefined;
        const tx = targetUnit?.x ?? this.targetX;
        const ty = targetUnit?.y ?? this.targetY;
        this.targetX = tx;
        this.targetY = ty;

        const t = Math.min(1, this.elapsed / this.flightDuration);
        const bx = (1 - t) * (1 - t) * this.startX + 2 * (1 - t) * t * this.controlX + t * t * tx;
        const by = (1 - t) * (1 - t) * this.startY + 2 * (1 - t) * t * this.controlY + t * t * ty;
        this.x = bx;
        this.y = by;

        const produced: Effect[] = [];

        if (!this.currentEffect) {
            // Create the visual effect once. The emitter updates its x, y directly each game tick.
            this.currentEffect = new Effect({
                x: bx,
                y: by,
                duration: this.flightDuration,
                effectType: 'StoryHomingParticle',
                effectData: { imageKey: 'darkBlob', tint: this.particleTint },
            });
            produced.push(this.currentEffect);
        } else if (this.currentEffect.active) {
            // Keep the effect's world position synced to the current bezier position.
            this.currentEffect.x = bx;
            this.currentEffect.y = by;
        }

        if (t >= 1 && !this.pulseSpawned) {
            this.pulseSpawned = true;
            produced.push(
                new Effect({
                    x: tx,
                    y: ty,
                    duration: 0.45,
                    effectType: 'Pulse',
                    effectData: { colors: this.pulseColors },
                }),
            );
            this.active = false;
        }

        return produced;
    }

    toJSON(): Record<string, unknown> {
        return {
            _type: 'StoryHomingParticleEmitter',
            id: this.id,
            x: this.x,
            y: this.y,
            elapsed: this.elapsed,
            startX: this.startX,
            startY: this.startY,
            controlX: this.controlX,
            controlY: this.controlY,
            targetUnitId: this.targetUnitId,
            targetX: this.targetX,
            targetY: this.targetY,
            pulseSpawned: this.pulseSpawned,
            flightDuration: this.flightDuration,
            particleTint: this.particleTint,
            pulseColors: this.pulseColors,
        };
    }

    restoreFromJSON(d: Record<string, unknown>): void {
        this.elapsed = (d.elapsed as number) ?? 0;
        this.startX = (d.startX as number) ?? this.x;
        this.startY = (d.startY as number) ?? this.y;
        this.controlX = (d.controlX as number) ?? this.x;
        this.controlY = (d.controlY as number) ?? this.y;
        this.targetUnitId = d.targetUnitId as string | undefined;
        this.targetX = (d.targetX as number) ?? this.x;
        this.targetY = (d.targetY as number) ?? this.y;
        this.pulseSpawned = (d.pulseSpawned as boolean) ?? false;
        this.currentEffect = null; // recreated on next tick
    }
}
