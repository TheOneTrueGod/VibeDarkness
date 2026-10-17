/**
 * Tile transition hooks — fired after a unit's position is finalized for a tick.
 *
 * `onLeave` / `onEnter` / `onLand` look up the ground effect at the relevant cell and
 * hand it to the def-driven thorn rules in `thorns.ts` (`TerrainEffectDef.thorns`). Thorns
 * only trigger on enter / land; there is no standing damage.
 */

import type { EventBus } from '../EventBus';
import type { TerrainLayerManager } from '../TerrainLayerManager';
import type { Unit } from '../units/Unit';
import { BRAMBLE_SLOW_EFFECT_TYPE, DARK_THORN_EFFECT_TYPE } from './terrainEffectDefs';
import { LIFTED_BUFF_TYPE } from '../../buffs/liftedBuffType';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { triggerThorns } from './thorns';

/** How long Thornbinder ground thorns last, in rounds (before jitter). */
export const DARK_THORN_DURATION_ROUNDS = 2;

export { BRAMBLE_SLOW_EFFECT_TYPE, DARK_THORN_EFFECT_TYPE };

export interface TileTransitionEngine {
    terrainLayers: TerrainLayerManager;
    eventBus: EventBus;
}

export interface TileCell {
    col: number;
    row: number;
}

interface UnitTileTransitionState {
    col: number;
    row: number;
    airborne: boolean;
}

/** Ephemeral per-unit last-cell / airborne bookkeeping — not checkpointed. */
const unitTileState = new Map<string, UnitTileTransitionState>();

/** Clear transition memory (e.g. after full engine restore). */
export function clearUnitTileTransitionState(): void {
    unitTileState.clear();
}

export function forgetUnitTileTransitionState(unitId: string): void {
    unitTileState.delete(unitId);
}

/**
 * True while the unit is in knockback air phase or lifted.
 * Knockback slide phase is grounded (enter damage applies).
 */
export function isUnitAirborne(unit: Unit): boolean {
    if (unit.hasBuff(LIFTED_BUFF_TYPE)) return true;
    const kb = unit.knockback;
    if (!kb) return false;
    return kb.knockbackElapsed < kb.knockbackAirTime;
}

function cellOf(unit: Unit): TileCell {
    return {
        col: Math.floor(unit.x / CELL_SIZE),
        row: Math.floor(unit.y / CELL_SIZE),
    };
}

function cellsEqual(a: TileCell, b: TileCell): boolean {
    return a.col === b.col && a.row === b.row;
}

/** Called when a unit leaves a cell. No thorn effect today. */
let onLeaveInvocationCount = 0;

/** Test helper — how many times `onLeave` has run since last reset. */
export function getOnLeaveInvocationCount(): number {
    return onLeaveInvocationCount;
}

export function resetOnLeaveInvocationCount(): void {
    onLeaveInvocationCount = 0;
}

export function onLeave(
    _cell: TileCell,
    _unit: Unit,
    _engine: TileTransitionEngine,
): void {
    onLeaveInvocationCount += 1;
    // No terrain leave effects yet.
}

/** Called when a grounded unit enters a new cell (skipped while airborne). */
export function onEnter(cell: TileCell, unit: Unit, engine: TileTransitionEngine): void {
    const effect = engine.terrainLayers.getGroundEffectAt(cell.col, cell.row);
    if (effect) triggerThorns(effect, unit, 'enter', engine);
}

/** Called when a unit transitions airborne to grounded. */
export function onLand(cell: TileCell, unit: Unit, engine: TileTransitionEngine): void {
    const effect = engine.terrainLayers.getGroundEffectAt(cell.col, cell.row);
    if (effect) triggerThorns(effect, unit, 'land', engine);
}

/**
 * After movement for this tick: fire leave/enter/land against ground terrain effects.
 * First observation of a unit seeds state without firing events.
 */
export function processUnitTileTransition(unit: Unit, engine: TileTransitionEngine): void {
    if (!unit.active || !unit.isAlive()) return;

    const curr = cellOf(unit);
    const airborne = isUnitAirborne(unit);
    const prev = unitTileState.get(unit.id);

    if (!prev) {
        unitTileState.set(unit.id, { col: curr.col, row: curr.row, airborne });
        return;
    }

    const prevCell: TileCell = { col: prev.col, row: prev.row };
    const cellChanged = !cellsEqual(prevCell, curr);
    const justLanded = prev.airborne && !airborne;

    if (cellChanged) {
        onLeave(prevCell, unit, engine);
    }

    if (justLanded) {
        onLand(curr, unit, engine);
    } else if (cellChanged && !airborne) {
        onEnter(curr, unit, engine);
    }

    unitTileState.set(unit.id, { col: curr.col, row: curr.row, airborne });
}
