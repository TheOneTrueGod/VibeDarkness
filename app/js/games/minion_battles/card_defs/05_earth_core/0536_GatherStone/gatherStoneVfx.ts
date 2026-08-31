/**
 * Gather Stone (0536) visual effects. Co-located with the ability; imports nothing
 * from `0536Ability.ts`. Deterministic geometry only (no Math.random).
 */

import { Effect } from '../../../game/effects/Effect';
import { StoryHomingParticleEmitter } from '../../../game/effects/StoryHomingParticleEmitter';
import type { Unit } from '../../../game/units/Unit';
import type { TileCoord } from '../../../abilities/tileAreaHelpers';
import {
    GATHER_STONE_PREFIRE,
    GATHER_STONE_RING_RADIUS,
} from '../earthCoreConstants';

/** Rock resource palette (see `resources/Rock.ts`). */
const STONE_COLOR = 0x92400e;
/** Loose rubble / debris grey. */
const RUBBLE_COLOR = 0x9ca3af;
const HOMING_CHIP_FLIGHT = 0.6;

export interface GatherStoneVfxEngine {
    addEffect(effect: Effect): void;
    addEffectEmitter(emitter: StoryHomingParticleEmitter): void;
    terrainManager?: {
        grid: { gridToWorld(col: number, row: number): { x: number; y: number } };
    } | null;
}

/** Windup "pull inward" ring at the caster. Mirrors `spawnGatherLightWindupRing`. */
export function spawnGatherStonePullRing(engine: GatherStoneVfxEngine, caster: Unit): void {
    engine.addEffect(new Effect({
        x: caster.x,
        y: caster.y,
        duration: GATHER_STONE_PREFIRE,
        effectType: 'Explosion',
        effectProperties: {
            direction: 'contract',
            shape: 'ring',
            color: STONE_COLOR,
            radius: GATHER_STONE_RING_RADIUS + caster.radius,
        },
    }));
}

function bezierControlPoint(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
): { cx: number; cy: number } {
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    const dx = endX - startX;
    const dy = endY - startY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const perpX = -dy / len;
    const perpY = dx / len;
    const arcHeight = Math.min(40, len * 0.35);
    return { cx: midX + perpX * arcHeight, cy: midY + perpY * arcHeight };
}

/**
 * Per damaged rock tile: a dust/crack impact, a contracting stone ring, and a
 * brown chip homing from the tile into the caster (mirrors `spawnGatherLightOrbs`).
 */
export function spawnGatherStoneRockImpacts(
    engine: GatherStoneVfxEngine,
    caster: Unit,
    damagedCells: readonly TileCoord[],
): void {
    const grid = engine.terrainManager?.grid;
    if (!grid) return;

    for (const cell of damagedCells) {
        const { x, y } = grid.gridToWorld(cell.col, cell.row);

        engine.addEffect(new Effect({
            x,
            y,
            duration: 0.3,
            effectType: 'TerrainImpact',
        }));
        engine.addEffect(new Effect({
            x,
            y,
            duration: 0.25,
            effectType: 'Explosion',
            effectProperties: {
                direction: 'contract',
                shape: 'ring',
                color: STONE_COLOR,
                radius: 18,
            },
        }));

        const { cx, cy } = bezierControlPoint(x, y, caster.x, caster.y);
        engine.addEffectEmitter(new StoryHomingParticleEmitter({
            x,
            y,
            startX: x,
            startY: y,
            controlX: cx,
            controlY: cy,
            targetUnitId: caster.id,
            targetX: caster.x,
            targetY: caster.y,
            duration: HOMING_CHIP_FLIGHT,
            tint: STONE_COLOR,
            imageKey: 'glowOrb',
            pulseColors: [0xb45309, 0x92400e, 0x78350f],
        }));
    }
}

/** Grey debris burst on an enemy hit by the Grinding Debris research strike. */
export function spawnGatherStoneRubbleClash(
    engine: GatherStoneVfxEngine,
    x: number,
    y: number,
): void {
    engine.addEffect(new Effect({
        x,
        y,
        duration: 0.25,
        effectType: 'Explosion',
        effectProperties: {
            direction: 'contract',
            shape: 'ring',
            color: RUBBLE_COLOR,
            radius: 14,
        },
    }));
}
