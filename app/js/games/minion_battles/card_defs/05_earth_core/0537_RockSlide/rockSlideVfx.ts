/**
 * Rock Slide (0537) visual effects. Deterministic geometry only (no Math.random).
 */

import { Effect } from '../../../game/effects/Effect';
import { StoryHomingParticleEmitter } from '../../../game/effects/StoryHomingParticleEmitter';
import type { Unit } from '../../../game/units/Unit';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { FIXED_DT } from '../../../game/gameConstants';
import { ROCK_SLIDE_SPAWN_TIME, ROCK_SLIDE_AIM_START } from '../earthCoreConstants';

const CHIP_COUNT = 4;
const CHIP_TINTS = [0x9ca3af, 0x757575, 0xb0b0b0, 0x6b5b4f];

export interface RockSlideVfxEngine {
    addEffect(effect: Effect): void;
    addEffectEmitter(emitter: StoryHomingParticleEmitter): void;
}

/**
 * Flight time of the chips that fly from the ripped-up rock into the caster. They start on the first
 * windup tick and land 0.05s before the rock is destroyed at the end of the windup.
 */
const INWARD_FLIGHT = ROCK_SLIDE_AIM_START - FIXED_DT - 0.05;
/** Flight time of the chips that fly out of the caster along the slide direction. */
const OUTWARD_FLIGHT = ROCK_SLIDE_SPAWN_TIME - ROCK_SLIDE_AIM_START;

function emitChip(
    engine: RockSlideVfxEngine,
    from: { x: number; y: number },
    to: { x: number; y: number },
    index: number,
    duration: number,
    targetUnitId?: string,
): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    // Fan the arcs out deterministically: chips alternate sides with a growing bow.
    const bow = (index % 2 === 0 ? 1 : -1) * (6 + index * 4);
    const cx = (from.x + to.x) / 2 + (-dy / len) * bow;
    const cy = (from.y + to.y) / 2 + (dx / len) * bow;
    engine.addEffectEmitter(new StoryHomingParticleEmitter({
        x: from.x,
        y: from.y,
        startX: from.x,
        startY: from.y,
        controlX: cx,
        controlY: cy,
        targetUnitId,
        targetX: to.x,
        targetY: to.y,
        duration,
        tint: CHIP_TINTS[index % CHIP_TINTS.length],
        imageKey: 'glowOrb',
        pulseColors: [0x9ca3af, 0x757575],
        pulseScale: 0.5,
        pulseAlpha: 0.6,
    }));
}

/** Step 1: chips tear loose from the picked rock and stream into the caster. */
export function spawnRockSlideInwardChips(engine: RockSlideVfxEngine, caster: Unit, rock: { x: number; y: number }): void {
    for (let i = 0; i < CHIP_COUNT; i++) {
        emitChip(engine, rock, { x: caster.x, y: caster.y }, i, INWARD_FLIGHT, caster.id);
    }
}

/** Step 4: chips burst out of the caster toward the chosen direction. */
export function spawnRockSlideOutwardChips(
    engine: RockSlideVfxEngine,
    caster: Unit,
    dirCol: number,
    dirRow: number,
): void {
    for (let i = 0; i < CHIP_COUNT; i++) {
        const reach = CELL_SIZE * (1 + 0.25 * i);
        emitChip(
            engine,
            { x: caster.x, y: caster.y },
            { x: caster.x + dirCol * reach, y: caster.y + dirRow * reach },
            i,
            OUTWARD_FLIGHT,
        );
    }
}

/** Step 2: dust and a crack where the rock was destroyed. */
export function spawnRockSlideBreak(engine: RockSlideVfxEngine, x: number, y: number): void {
    engine.addEffect(new Effect({ x, y, duration: 0.3, effectType: 'TerrainImpact' }));
}

/** A rock settling into the ground (projectile landing, or cancelled before launch). */
export function spawnRockSlideSettle(engine: RockSlideVfxEngine, x: number, y: number): void {
    engine.addEffect(new Effect({ x, y, duration: 0.3, effectType: 'TerrainImpact' }));
    engine.addEffect(new Effect({
        x,
        y,
        duration: 0.25,
        effectType: 'Explosion',
        effectProperties: { direction: 'contract', shape: 'ring', color: 0x9ca3af, radius: CELL_SIZE / 2 },
    }));
}
