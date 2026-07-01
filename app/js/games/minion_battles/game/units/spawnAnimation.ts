import type { Unit } from './Unit';
import type { EngineContext } from '../EngineContext';
import { Effect } from '../effects/Effect';
import { getUnitSpawnDef } from './unit_defs/unitDef';

const DEFAULT_DARK_VORTEX_DURATION = 0.5;
const PHASE2_START_FRACTION = 0.4; // fraction of duration at which phase 2 starts

/** Tick the spawn animation for a spawning unit, emitting particles and decrementing the timer. */
export function tickSpawnAnimation(unit: Unit, dt: number, engine: EngineContext): void {
    const spawnDef = getUnitSpawnDef(unit.characterId);

    if (!spawnDef || spawnDef.type === 'darkVortex') {
        tickDarkVortex(unit, dt, engine, spawnDef?.duration ?? DEFAULT_DARK_VORTEX_DURATION);
    }
    // burstRise: pure renderer animation — no engine-side particle effects

    unit.spawnTimer = Math.max(0, unit.spawnTimer - dt);
}

function tickDarkVortex(unit: Unit, dt: number, engine: EngineContext, duration: number): void {
    const elapsed = duration - unit.spawnTimer;
    const prevElapsed = Math.max(0, elapsed - dt);
    const phase2Start = duration * PHASE2_START_FRACTION;

    // Phase 1: spiral condensing particles
    if (elapsed < phase2Start) {
        const RATE = 20;
        const count = Math.floor(elapsed * RATE) - Math.floor(prevElapsed * RATE);
        for (let i = 0; i < count; i++) {
            const angle = engine.generateRandomNumber() * 2 * Math.PI;
            const radius = 40 + engine.generateRandomNumber() * 30;
            const px = unit.x + Math.cos(angle) * radius;
            const py = unit.y + Math.sin(angle) * radius;
            const inwardSpeed = 120 + engine.generateRandomNumber() * 60;
            const tangentSpeed = 70 + engine.generateRandomNumber() * 40;
            const vx = -Math.cos(angle) * inwardSpeed + -Math.sin(angle) * tangentSpeed;
            const vy = -Math.sin(angle) * inwardSpeed + Math.cos(angle) * tangentSpeed;
            engine.addEffect(new Effect({
                x: px, y: py, duration: 0.35,
                effectType: 'ParticleImage',
                effectData: { imageKey: 'darkBlob', vx, vy, scale: 0.2 + engine.generateRandomNumber() * 0.15, tint: 0x9933cc },
            }));
        }
    }

    // Phase 2: dust cloud burst
    if (elapsed >= phase2Start) {
        const RATE = 15;
        const phase2Elapsed = elapsed - phase2Start;
        const phase2PrevElapsed = Math.max(0, prevElapsed - phase2Start);
        const count = Math.floor(phase2Elapsed * RATE) - Math.floor(phase2PrevElapsed * RATE);
        for (let i = 0; i < count; i++) {
            const angle = engine.generateRandomNumber() * 2 * Math.PI;
            const speed = 50 + engine.generateRandomNumber() * 60;
            engine.addEffect(new Effect({
                x: unit.x + (engine.generateRandomNumber() - 0.5) * 16,
                y: unit.y + (engine.generateRandomNumber() - 0.5) * 16,
                duration: 0.3,
                effectType: 'ParticleImage',
                effectData: {
                    imageKey: 'darkBlob',
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    scale: 0.4 + engine.generateRandomNumber() * 0.25,
                    tint: 0xbbbbbb,
                },
            }));
        }
    }
}
