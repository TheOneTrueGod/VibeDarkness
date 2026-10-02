/**
 * Helpers for Gather Light (0804): random tile selection, permanent base darkness, and homing orb VFX.
 */

import { LightSource } from '../game/lightSources/LightSource';
import { Effect } from '../game/effects/Effect';
import { StoryHomingParticleEmitter } from '../game/effects/StoryHomingParticleEmitter';
import type { EngineContext } from '../game/EngineContext';
import type { Unit } from '../game/units/Unit';
import { LIGHT_RESOURCE_COLOR_NUMBER } from '../resources/Light';

/** Ability windup time; owned here (not `0804Ability.ts`) to avoid a circular import — this
 * file is imported by `0804Ability.ts`, so the dependency can only flow one way. */
export const GATHER_LIGHT_PREFIRE_TIME = 0.5;
/** Radius of each permanent base-darkness source (one tile). */
export const GATHER_LIGHT_DARKNESS_RADIUS = 0;
/** Half-width of the candidate area around the caster (2 → 5×5). */
export const GATHER_LIGHT_AREA_RADIUS = 2;
/** Number of tiles darkened per cast (fewer if not enough lit tiles). */
export const GATHER_LIGHT_TILE_COUNT = 10;
/** Homing orb flight time (vs 2s story default). */
export const GATHER_LIGHT_ORB_DURATION = 0.6;
/** Yellow orb tint (Light palette). */
export const GATHER_LIGHT_ORB_TINT = 0xffe066;
/** Purple windup ring color. */
export const GATHER_LIGHT_RING_RADIUS = 25;
export const GATHER_LIGHT_RING_DURATION = GATHER_LIGHT_PREFIRE_TIME;

/** Permanent base-darkness sources use a very long round lifetime with noDecay. */
export const GATHER_LIGHT_DARKNESS_ROUNDS_TOTAL = 9999;

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

/** All in-bounds tiles of the (2r+1)×(2r+1) square centered on the caster, caster included. */
export function getGatherLightCandidateTiles(
    casterCol: number,
    casterRow: number,
    gridW: number,
    gridH: number,
    areaRadius: number = GATHER_LIGHT_AREA_RADIUS,
): GridCell[] {
    const tiles: GridCell[] = [];
    for (let dRow = -areaRadius; dRow <= areaRadius; dRow++) {
        for (let dCol = -areaRadius; dCol <= areaRadius; dCol++) {
            const col = casterCol + dCol;
            const row = casterRow + dRow;
            if (isInBounds(col, row, gridW, gridH)) {
                tiles.push({ col, row });
            }
        }
    }
    return tiles;
}

/** Partial Fisher–Yates using the engine's synced RNG; returns up to `count` items. */
export function pickRandomTiles(
    engine: { generateRandomInteger(min: number, max: number): number },
    tiles: readonly GridCell[],
    count: number,
): GridCell[] {
    const pool = [...tiles];
    const n = Math.min(count, pool.length);
    for (let i = 0; i < n; i++) {
        const j = engine.generateRandomInteger(i, pool.length - 1);
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
}

export function spawnBaseDarknessAtTile(
    engine: EngineWithGatherLight,
    col: number,
    row: number,
    roundNumber: number,
    amount: number,
    radius: number = GATHER_LIGHT_DARKNESS_RADIUS,
): void {
    const grid = engine.terrainManager?.grid;
    if (!grid) return;
    const { x, y } = grid.gridToWorld(col, row);
    engine.addLightSource(new LightSource({
        x,
        y,
        lightAmount: amount,
        radius,
        overlapMethod: { method: 'base' },
        decay: {
            roundCreated: roundNumber,
            initialLightAmount: amount,
            initialRadius: radius,
            roundsTotal: GATHER_LIGHT_DARKNESS_ROUNDS_TOTAL,
            noDecay: true,
        },
    }));
}

export function spawnGatherLightWindupRing(
    engine: EngineWithGatherLight,
    caster: Unit,
		color: number = LIGHT_RESOURCE_COLOR_NUMBER,
): void {
    engine.addEffect(new Effect({
        x: caster.x,
        y: caster.y,
        duration: GATHER_LIGHT_RING_DURATION,
        effectType: 'Explosion',
        effectProperties: {
            direction: 'expand',
            shape: 'ring',
            color,
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

/** One homing yellow orb per darkened tile flying toward the caster. */
export function spawnGatherLightOrbs(
    engine: EngineWithGatherLight,
    caster: Unit,
    tiles: readonly GridCell[],
): void {
    const grid = engine.terrainManager?.grid;
    if (!grid) return;

    for (const { col, row } of tiles) {
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

/**
 * Darkens up to GATHER_LIGHT_TILE_COUNT random tiles in the 5×5 around the caster. Only tiles whose
 * current light is at least |darknessAmount| are eligible, so a tile never goes below zero light.
 * Each tile gets its own radius-0 base source (tiles are distinct, so nothing stacks).
 */
export function applyGatherLightDarkness(
    engine: EngineWithGatherLight,
    caster: Unit,
    roundNumber: number,
    darknessAmount: number,
): { darknessTiles: GridCell[] } {
    const grid = engine.terrainManager?.grid;
    if (!grid) return { darknessTiles: [] };

    const { col: casterCol, row: casterRow } = grid.worldToGrid(caster.x, caster.y);
    const needed = Math.abs(darknessAmount);
    const eligible = getGatherLightCandidateTiles(casterCol, casterRow, grid.width, grid.height)
        .filter(({ col, row }) => (engine.getLightAt(col, row) ?? 0) >= needed);
    const darknessTiles = pickRandomTiles(engine, eligible, GATHER_LIGHT_TILE_COUNT);

    for (const { col, row } of darknessTiles) {
        spawnBaseDarknessAtTile(engine, col, row, roundNumber, darknessAmount, GATHER_LIGHT_DARKNESS_RADIUS);
    }
    return { darknessTiles };
}
