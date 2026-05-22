/**
 * StoryHomingParticleEmitter — tracks a single homing particle along a quadratic bezier path.
 *
 * Each game tick the emitter:
 *   1. Advances elapsed / updates live target position via engine.getUnit().
 *   2. Computes the current bezier position and adds a short-lived StoryHomingParticle
 *      visual Effect at that position (the renderer draws it using storyHomingParticleEffectDef).
 *   3. At completion (elapsed >= 2 s) spawns a Pulse Effect and deactivates.
 *
 * Using one short-lived visual Effect per tick preserves the existing renderer path
 * (storyHomingParticleEffectDef in effect_defs/deathEffects.ts) while keeping all
 * game-logic (unit tracking, bezier math) inside an EffectEmitter where it belongs.
 */

import { EffectEmitter } from './EffectEmitter';
import { Effect } from './Effect';
import type { EngineContext } from '../EngineContext';

const DURATION = 2; // seconds to reach the target
/** Duration of each per-tick visual Effect; must exceed the game tick (1/60 s). */
const VISUAL_EFFECT_DURATION = 2 / 60; // ~2 frames – just long enough to be seen

export class StoryHomingParticleEmitter extends EffectEmitter {
    private startX: number;
    private startY: number;
    private controlX: number;
    private controlY: number;
    private targetUnitId?: string;
    private targetX: number;
    private targetY: number;
    private pulseSpawned: boolean = false;

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
        /** Restore elapsed (used by restoreFromJSON). */
        elapsed?: number;
        pulseSpawned?: boolean;
    }) {
        super({ id: config.id, x: config.x, y: config.y, lifetime: DURATION });
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

        // Update live target position
        const targetUnit = this.targetUnitId ? engine.getUnit(this.targetUnitId) : undefined;
        const tx = targetUnit?.x ?? this.targetX;
        const ty = targetUnit?.y ?? this.targetY;
        this.targetX = tx;
        this.targetY = ty;

        const t = Math.min(1, this.elapsed / DURATION);
        const bx = (1 - t) * (1 - t) * this.startX + 2 * (1 - t) * t * this.controlX + t * t * tx;
        const by = (1 - t) * (1 - t) * this.startY + 2 * (1 - t) * t * this.controlY + t * t * ty;
        this.x = bx;
        this.y = by;

        const produced: Effect[] = [];

        if (t >= 1 && !this.pulseSpawned) {
            this.pulseSpawned = true;
            produced.push(
                new Effect({
                    x: tx,
                    y: ty,
                    duration: 0.45,
                    effectType: 'Pulse',
                    effectData: { colors: [0xa855f7, 0x7e22ce, 0x581c87] },
                }),
            );
            this.active = false;
            return produced;
        }

        // Emit a short-lived visual Effect at the current bezier position so the renderer draws it.
        produced.push(
            new Effect({
                x: bx,
                y: by,
                duration: VISUAL_EFFECT_DURATION,
                effectType: 'StoryHomingParticle',
                effectData: {
                    imageKey: 'darkBlob',
                    /** progress is always ~0 so the visual appears at full opacity/size each tick. */
                },
            }),
        );

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
    }
}
