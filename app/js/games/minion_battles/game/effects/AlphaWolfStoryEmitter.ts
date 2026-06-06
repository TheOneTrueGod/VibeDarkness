/**
 * AlphaWolfStoryEmitter — drives the alpha wolf death particle sequence.
 *
 * Two phases:
 *   - Radial (0–1 s): 24 dark-blob particles/sec burst outward from the wolf position.
 *   - Homing (1–3 s): 20 homing particles/sec spawn StoryHomingParticleEmitters targeting
 *     random living player-controlled units.
 *
 * Deactivates automatically after 3 seconds of emission (the story pause itself is 5 s, but
 * emission only happens during 0–3 s).
 */

import { EffectEmitter } from './EffectEmitter';
import { StoryHomingParticleEmitter } from './StoryHomingParticleEmitter';
import { Effect } from './Effect';
import type { EngineContext } from '../EngineContext';

export class AlphaWolfStoryEmitter extends EffectEmitter {
    radialRatePerSecond: number;
    homingRatePerSecond: number;
    private radialRemainder: number = 0;
    private homingRemainder: number = 0;

    constructor(config: {
        id?: string;
        x: number;
        y: number;
        radialRatePerSecond?: number;
        homingRatePerSecond?: number;
        /** Restore accumulators (used by restoreFromJSON). */
        radialRemainder?: number;
        homingRemainder?: number;
        elapsed?: number;
    }) {
        super({ id: config.id, x: config.x, y: config.y, lifetime: 3 });
        this.radialRatePerSecond = config.radialRatePerSecond ?? 24;
        this.homingRatePerSecond = config.homingRatePerSecond ?? 20;
        this.radialRemainder = config.radialRemainder ?? 0;
        this.homingRemainder = config.homingRemainder ?? 0;
        if (config.elapsed != null) this.elapsed = config.elapsed;
    }

    update(dt: number, engine: EngineContext): Effect[] {
        this.elapsed += dt;

        const produced: Effect[] = [];

        const radialPhase = this.elapsed <= 1;
        const homingPhase = this.elapsed > 1 && this.elapsed <= 3;

        if (radialPhase) {
            const total = this.radialRatePerSecond * dt + this.radialRemainder;
            const spawnCount = Math.floor(total);
            this.radialRemainder = total - spawnCount;
            for (let i = 0; i < spawnCount; i++) {
                const angle = engine.generateRandomNumber() * 2 * Math.PI;
                const speed = 120 + engine.generateRandomNumber() * 160;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                produced.push(
                    new Effect({
                        x: this.x,
                        y: this.y,
                        duration: 1,
                        effectType: 'ParticleImage',
                        effectData: { imageKey: 'darkBlob', vx, vy, scale: 0.7 + engine.generateRandomNumber() * 0.5 },
                    }),
                );
            }
        }

        if (homingPhase) {
            const homingTargets = engine.units.filter((u) => u.isAlive() && u.isPlayerControlled());
            if (homingTargets.length > 0) {
                const total = this.homingRatePerSecond * dt + this.homingRemainder;
                const spawnCount = Math.floor(total);
                this.homingRemainder = total - spawnCount;
                for (let i = 0; i < spawnCount; i++) {
                    const idx = engine.generateRandomInteger(0, homingTargets.length - 1);
                    const target = homingTargets[idx];
                    if (!target) continue;
                    const spawnAngle = engine.generateRandomNumber() * 2 * Math.PI;
                    const spawnRadius = 16 + engine.generateRandomNumber() * 20;
                    const sx = this.x + Math.cos(spawnAngle) * spawnRadius;
                    const sy = this.y + Math.sin(spawnAngle) * spawnRadius;
                    const mx = (sx + target.x) * 0.5 + (engine.generateRandomNumber() * 240 - 120);
                    const my = (sy + target.y) * 0.5 - (70 + engine.generateRandomNumber() * 80);
                    engine.addEffectEmitter(
                        new StoryHomingParticleEmitter({
                            x: sx,
                            y: sy,
                            startX: sx,
                            startY: sy,
                            controlX: mx,
                            controlY: my,
                            targetUnitId: target.id,
                            targetX: target.x,
                            targetY: target.y,
                        }),
                    );
                }
            }
        }

        if (this.elapsed >= this.lifetime) {
            this.active = false;
        }

        return produced;
    }

    toJSON(): Record<string, unknown> {
        return {
            _type: 'AlphaWolfStoryEmitter',
            id: this.id,
            x: this.x,
            y: this.y,
            elapsed: this.elapsed,
            radialRatePerSecond: this.radialRatePerSecond,
            homingRatePerSecond: this.homingRatePerSecond,
            radialRemainder: this.radialRemainder,
            homingRemainder: this.homingRemainder,
        };
    }

    restoreFromJSON(d: Record<string, unknown>): void {
        this.elapsed = (d.elapsed as number) ?? 0;
        this.radialRemainder = (d.radialRemainder as number) ?? 0;
        this.homingRemainder = (d.homingRemainder as number) ?? 0;
    }
}
