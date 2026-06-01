import type { Unit } from './Unit';
import type { EngineContext } from '../EngineContext';
import { Effect } from '../effects/Effect';

const TOTAL_DURATION = 0.5;
const PHASE2_START = 0.2;

/** Tick the spawn animation for a spawning enemy unit, emitting particles and decrementing the timer. */
export function tickSpawnAnimation(unit: Unit, dt: number, engine: EngineContext): void {
    const elapsed = TOTAL_DURATION - unit.spawnTimer;

    // Phase 1: spiral condensing particles (elapsed 0–0.2s)
    if (elapsed < PHASE2_START) {
        const RATE = 20;
        unit.spawnParticleAcc1 += RATE * dt;
        const count = Math.floor(unit.spawnParticleAcc1);
        unit.spawnParticleAcc1 -= count;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const radius = 40 + Math.random() * 30;
            const px = unit.x + Math.cos(angle) * radius;
            const py = unit.y + Math.sin(angle) * radius;
            const inwardSpeed = 120 + Math.random() * 60;
            const tangentSpeed = 70 + Math.random() * 40;
            const vx = -Math.cos(angle) * inwardSpeed + -Math.sin(angle) * tangentSpeed;
            const vy = -Math.sin(angle) * inwardSpeed + Math.cos(angle) * tangentSpeed;
            engine.addEffect(new Effect({
                x: px, y: py, duration: 0.35,
                effectType: 'ParticleImage',
                effectData: { imageKey: 'darkBlob', vx, vy, scale: 0.2 + Math.random() * 0.15, tint: 0x9933cc },
            }));
        }
    }

    // Phase 2: dust cloud burst (elapsed 0.2–0.5s)
    if (elapsed >= PHASE2_START) {
        const RATE = 15;
        unit.spawnParticleAcc2 += RATE * dt;
        const count = Math.floor(unit.spawnParticleAcc2);
        unit.spawnParticleAcc2 -= count;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * 2 * Math.PI;
            const speed = 50 + Math.random() * 60;
            engine.addEffect(new Effect({
                x: unit.x + (Math.random() - 0.5) * 16,
                y: unit.y + (Math.random() - 0.5) * 16,
                duration: 0.3,
                effectType: 'ParticleImage',
                effectData: {
                    imageKey: 'darkBlob',
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    scale: 0.4 + Math.random() * 0.25,
                    tint: 0xbbbbbb,
                },
            }));
        }
    }

    unit.spawnTimer = Math.max(0, unit.spawnTimer - dt);
}
