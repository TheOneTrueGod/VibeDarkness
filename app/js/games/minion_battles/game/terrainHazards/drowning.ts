/**
 * Drowning — the `drown` terrain hazard (Water).
 *
 * A grounded unit forced onto Water starts drowning: it is untargetable and cannot act or move
 * while it sinks (renderer: `getDrowningRenderState`). When the animation ends it reappears on
 * the nearest walkable tile and takes the hazard's damage. If no walkable tile exists it logs an
 * error and stays on the water, unharmed.
 *
 * State lives on `unit.terrainHazard` and is checkpointed with the unit.
 */

import type { Unit } from '../units/Unit';
import type { EngineContext } from '../EngineContext';
import type { EventBus } from '../EventBus';
import type { TerrainManager } from '../../terrain/TerrainManager';
import { TERRAIN_PROPERTIES, type TerrainHazardId } from '../../terrain/TerrainType';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { findNearestPassableCell } from '../forceMove';
import { TERRAIN_HAZARD_DEFS } from './terrainHazardDefs';

/** Serialized per-unit hazard state (null when not in a hazard). */
export interface UnitTerrainHazardState {
    hazardId: TerrainHazardId;
    /** Seconds since the hazard started (world clock, like the spawn animation). */
    elapsed: number;
    /** False until abilities have been interrupted on the first hazard tick. */
    started: boolean;
}

export interface TerrainHazardEngine {
    terrainManager?: TerrainManager | null;
}

/** Hazard for the effective terrain at a cell, if any. */
export function getTerrainHazardAt(
    terrainManager: TerrainManager | null | undefined,
    col: number,
    row: number,
): TerrainHazardId | null {
    if (!terrainManager || !terrainManager.isInBounds(col, row)) return null;
    return TERRAIN_PROPERTIES[terrainManager.getEffectiveTerrainType(col, row)].forcedEntryHazard ?? null;
}

/**
 * Starts the hazard for a grounded unit that just entered/landed on `cell`, if its terrain has
 * one. Stops knockback and walking immediately; abilities are interrupted on the first tick.
 */
export function triggerTerrainHazard(
    unit: Unit,
    cell: { col: number; row: number },
    engine: TerrainHazardEngine,
): boolean {
    if (unit.terrainHazard || !unit.isAlive()) return false;
    const hazardId = getTerrainHazardAt(engine.terrainManager, cell.col, cell.row);
    if (!hazardId) return false;
    unit.terrainHazard = { hazardId, elapsed: 0, started: false };
    unit.knockback = null;
    unit.clearMovement();
    return true;
}

/** Advances the hazard; on completion moves the unit to walkable ground and applies damage. */
export function tickTerrainHazard(unit: Unit, dt: number, engine: EngineContext): void {
    const state = unit.terrainHazard;
    if (!state) return;
    if (!state.started) {
        state.started = true;
        unit.interruptAllAbilities(engine);
    }
    const def = TERRAIN_HAZARD_DEFS[state.hazardId];
    state.elapsed = Math.min(def.durationSeconds, state.elapsed + dt);
    if (state.elapsed < def.durationSeconds) return;

    unit.terrainHazard = null;
    finishTerrainHazard(unit, def.damage, engine.terrainManager, engine.eventBus);
}

function finishTerrainHazard(
    unit: Unit,
    damage: number,
    terrainManager: TerrainManager | null,
    eventBus: EventBus,
): void {
    const col = Math.floor(unit.x / CELL_SIZE);
    const row = Math.floor(unit.y / CELL_SIZE);
    const target = terrainManager ? findNearestPassableCell(terrainManager, col, row) : null;
    if (!target) {
        console.error(
            `[terrainHazard] No walkable tile to rescue unit ${unit.id} at (${col}, ${row}); leaving it on the hazard unharmed.`,
        );
        return;
    }
    unit.x = target.col * CELL_SIZE + CELL_SIZE / 2;
    unit.y = target.row * CELL_SIZE + CELL_SIZE / 2;
    unit.takeDamage(damage, null, eventBus);
}

export interface DrowningRenderState {
    /** 0 → 1 over the hazard. */
    progress: number;
    /** Pixels to move the unit visual down. */
    sinkY: number;
    /** World y of the water line; the visual is clipped below it. */
    waterLineY: number;
}

/** Render-only sink for a drowning unit, or null when the unit is not in a hazard. */
export function getDrowningRenderState(unit: Unit): DrowningRenderState | null {
    const state = unit.terrainHazard;
    if (!state) return null;
    const def = TERRAIN_HAZARD_DEFS[state.hazardId];
    const progress = def.durationSeconds > 0 ? Math.min(1, state.elapsed / def.durationSeconds) : 1;
    // Ease in so the unit tips in slowly, then drops; sink a little past its full height.
    const eased = progress * progress;
    return {
        progress,
        sinkY: eased * unit.radius * 2.6,
        waterLineY: unit.y + unit.radius * 0.6,
    };
}
