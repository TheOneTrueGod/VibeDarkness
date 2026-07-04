/**
 * Helpers for Gather Light (0804): tile selection, permanent base darkness, and homing orb VFX.
 */

import { LightSource } from '../game/lightSources/LightSource';
import { Effect } from '../game/effects/Effect';
import { StoryHomingParticleEmitter } from '../game/effects/StoryHomingParticleEmitter';
import type { EngineContext } from '../game/EngineContext';
import type { Unit } from '../game/units/Unit';

/** Ability windup time; owned here (not `0804Ability.ts`) to avoid a circular import — this
 * file is imported by `0804Ability.ts`, so the dependency can only flow one way. */
export const GATHER_LIGHT_PREFIRE_TIME = 0.5;
/** One darkness step applied per Gather Light cast to each affected tile. */
export const GATHER_LIGHT_DARKNESS_AMOUNT = -2;
/** Homing orb flight time (vs 2s story default). */
export const GATHER_LIGHT_ORB_DURATION = 0.6;
/** Yellow orb tint (Light palette). */
export const GATHER_LIGHT_ORB_TINT = 0xffe066;
/** Purple windup ring color. */
export const GATHER_LIGHT_RING_COLOR = 0x9933cc;
export const GATHER_LIGHT_RING_RADIUS = 25;
export const GATHER_LIGHT_RING_DURATION = GATHER_LIGHT_PREFIRE_TIME;

/** Permanent base-darkness sources use a very long round lifetime with noDecay. */
export const GATHER_LIGHT_DARKNESS_ROUNDS_TOTAL = 9999;

/** Eight diagonal and cardinal offsets (excludes caster tile). */
export const ADJACENT_TILE_OFFSETS = [
    { dCol: -1, dRow: -1 },
    { dCol: 0, dRow: -1 },
    { dCol: 1, dRow: -1 },
    { dCol: -1, dRow: 0 },
    { dCol: 1, dRow: 0 },
    { dCol: -1, dRow: 1 },
    { dCol: 0, dRow: 1 },
    { dCol: 1, dRow: 1 },
] as const;

export interface GridCell {
    col: number;
    row: number;
}

export type EngineWithGatherLight = EngineContext & {
    addLightSource(ls: LightSource): void;
    addEffect(effect: Effect): void;
    addEffectEmitter(emitter: StoryHomingParticleEmitter): void;
};

function isInBounds(col: number, row: number, gridW: number, gridH: number): boolean {
    return col >= 0 && row >= 0 && col < gridW && row < gridH;
}

/** Caster tile plus up to eight adjacent tiles, bounds-clamped. */
export function getGatherLightTiles(
    casterCol: number,
    casterRow: number,
    gridW: number,
    gridH: number,
): GridCell[] {
    const tiles: GridCell[] = [{ col: casterCol, row: casterRow }];
    for (const { dCol, dRow } of ADJACENT_TILE_OFFSETS) {
        const col = casterCol + dCol;
        const row = casterRow + dRow;
        if (isInBounds(col, row, gridW, gridH)) {
            tiles.push({ col, row });
        }
    }
    return tiles;
}

/** Up to eight adjacent tiles only (no caster), bounds-clamped. */
export function getAdjacentGatherLightTiles(
    casterCol: number,
    casterRow: number,
    gridW: number,
    gridH: number,
): GridCell[] {
    const tiles: GridCell[] = [];
    for (const { dCol, dRow } of ADJACENT_TILE_OFFSETS) {
        const col = casterCol + dCol;
        const row = casterRow + dRow;
        if (isInBounds(col, row, gridW, gridH)) {
            tiles.push({ col, row });
        }
    }
    return tiles;
}

export function spawnBaseDarknessAtTile(
    engine: EngineWithGatherLight,
    col: number,
    row: number,
    roundNumber: number,
    amount: number = GATHER_LIGHT_DARKNESS_AMOUNT,
): void {
    const grid = engine.terrainManager?.grid;
    if (!grid) return;
    const { x, y } = grid.gridToWorld(col, row);
    engine.addLightSource(new LightSource({
        x,
        y,
        lightAmount: amount,
        radius: 0,
        overlapMethod: { method: 'base' },
        decay: {
            roundCreated: roundNumber,
            initialLightAmount: amount,
            initialRadius: 0,
            roundsTotal: GATHER_LIGHT_DARKNESS_ROUNDS_TOTAL,
            noDecay: true,
        },
    }));
}

export function spawnGatherLightWindupRing(
    engine: EngineWithGatherLight,
    caster: Unit,
): void {
    engine.addEffect(new Effect({
        x: caster.x,
        y: caster.y,
        duration: GATHER_LIGHT_RING_DURATION,
        effectType: 'Explosion',
        effectProperties: {
            direction: 'expand',
            shape: 'ring',
            color: GATHER_LIGHT_RING_COLOR,
            radius: GATHER_LIGHT_RING_RADIUS + caster.radius,
        },
    }));
}

function bezierControlPoint(startX: number, startY: number, endX: number, endY: number): { cx: number; cy: number } {
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

/** One homing yellow orb per adjacent tile flying toward the caster. */
export function spawnGatherLightOrbs(
    engine: EngineWithGatherLight,
    caster: Unit,
    adjacentTiles: readonly GridCell[],
): void {
    const grid = engine.terrainManager?.grid;
    if (!grid) return;

    for (const { col, row } of adjacentTiles) {
        const { x: startX, y: startY } = grid.gridToWorld(col, row);
        const { cx, cy } = bezierControlPoint(startX, startY, caster.x, caster.y);
        engine.addEffectEmitter(new StoryHomingParticleEmitter({
            x: startX,
            y: startY,
            startX,
            startY,
            controlX: cx,
            controlY: cy,
            targetUnitId: caster.id,
            targetX: caster.x,
            targetY: caster.y,
            duration: GATHER_LIGHT_ORB_DURATION,
            tint: GATHER_LIGHT_ORB_TINT,
            // 'darkBlob' (the emitter's default) has a saturated purple fill; multiplicative
            // tint can only darken it, never recolor it to yellow. 'glowOrb' is neutral white
            // so GATHER_LIGHT_ORB_TINT renders faithfully.
            imageKey: 'glowOrb',
            pulseColors: [0xffe066, 0xfcd34d, 0xfbbf24],
        }));
    }
}

export function applyGatherLightDarkness(
    engine: EngineWithGatherLight,
    caster: Unit,
    roundNumber: number,
): { darknessTiles: GridCell[]; adjacentTiles: GridCell[] } {
    const grid = engine.terrainManager?.grid;
    if (!grid) return { darknessTiles: [], adjacentTiles: [] };

    const { col: casterCol, row: casterRow } = grid.worldToGrid(caster.x, caster.y);
    const darknessTiles = getGatherLightTiles(casterCol, casterRow, grid.width, grid.height);
    const adjacentTiles = getAdjacentGatherLightTiles(casterCol, casterRow, grid.width, grid.height);

    for (const { col, row } of darknessTiles) {
        spawnBaseDarknessAtTile(engine, col, row, roundNumber);
    }

    return { darknessTiles, adjacentTiles };
}
