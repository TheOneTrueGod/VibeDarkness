/**
 * Tile transition hooks — fired after a unit's position is finalized for a tick.
 *
 * `onLeave` / `onEnter` / `onLand` look up the ground effect at the relevant cell and
 * dispatch by `effectType`. Thorn types (`bramble_slow`, `dark_thorn`) deal enter/land
 * damage here; standing DoT remains in `dotTick.ts`.
 */

import type { EventBus } from '../EventBus';
import type { TerrainLayerManager } from '../TerrainLayerManager';
import type { Unit } from '../units/Unit';
import { LIFTED_BUFF_TYPE } from '../../buffs/LiftedBuff';
import { CELL_SIZE } from '../../terrain/TerrainGrid';
import { getCreatureType } from '../units/unit_defs/unitDef';

export const THORN_ENTER_DAMAGE = 2;
export const THORN_LAND_DAMAGE = 4;
/** Thornbinder `dark_thorn` enter damage (same as shared thorn enter). */
export const DARK_THORN_ENTER_DAMAGE = THORN_ENTER_DAMAGE;
/** Thornbinder `dark_thorn` land damage (2× shared thorn land). */
export const DARK_THORN_LAND_DAMAGE = THORN_LAND_DAMAGE * 2;
/** How long Thornbinder ground thorns last, in rounds (before jitter). */
export const DARK_THORN_DURATION_ROUNDS = 2;

export const BRAMBLE_SLOW_EFFECT_TYPE = 'bramble_slow';
export const DARK_THORN_EFFECT_TYPE = 'dark_thorn';

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

/** `bramble_slow` only hurts dark creatures; everyone else is immune. */
export function isImmuneToBrambleSlow(unit: Unit): boolean {
    return getCreatureType(unit.characterId) !== 'dark_creature';
}

/** `dark_thorn` hurts everyone except dark creatures. */
export function isImmuneToDarkThorn(unit: Unit): boolean {
    return getCreatureType(unit.characterId) === 'dark_creature';
}

function isImmuneToThornEffect(unit: Unit, effectType: string): boolean {
    if (effectType === BRAMBLE_SLOW_EFFECT_TYPE) return isImmuneToBrambleSlow(unit);
    if (effectType === DARK_THORN_EFFECT_TYPE) return isImmuneToDarkThorn(unit);
    return true;
}

/** @returns true if damage was applied. */
function applyThornDamage(
    unit: Unit,
    effectType: string,
    ownerUnitId: string | null,
    damage: number,
    eventBus: EventBus,
): boolean {
    if (!unit.isAlive()) return false;
    if (isImmuneToThornEffect(unit, effectType)) return false;
    unit.takeDamage(damage, ownerUnitId, eventBus);
    return true;
}

function destroyDarkThornAfterDamage(
    effect: { id: string; effectType: string },
    dealtDamage: boolean,
    terrainLayers: TerrainLayerManager,
): void {
    if (!dealtDamage || effect.effectType !== DARK_THORN_EFFECT_TYPE) return;
    terrainLayers.remove(effect.id);
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

function enterOrLandDamageFor(effectType: string, kind: 'enter' | 'land'): number {
    if (effectType === DARK_THORN_EFFECT_TYPE) {
        return kind === 'enter' ? DARK_THORN_ENTER_DAMAGE : DARK_THORN_LAND_DAMAGE;
    }
    return kind === 'enter' ? THORN_ENTER_DAMAGE : THORN_LAND_DAMAGE;
}

/** Called when a grounded unit enters a new cell (skipped while airborne). */
export function onEnter(cell: TileCell, unit: Unit, engine: TileTransitionEngine): void {
    const effect = engine.terrainLayers.getGroundEffectAt(cell.col, cell.row);
    if (!effect) return;
    if (
        effect.effectType === BRAMBLE_SLOW_EFFECT_TYPE ||
        effect.effectType === DARK_THORN_EFFECT_TYPE
    ) {
        const dealt = applyThornDamage(
            unit,
            effect.effectType,
            effect.ownerUnitId ?? null,
            enterOrLandDamageFor(effect.effectType, 'enter'),
            engine.eventBus,
        );
        destroyDarkThornAfterDamage(effect, dealt, engine.terrainLayers);
    }
}

/** Called when a unit transitions airborne → grounded. */
export function onLand(cell: TileCell, unit: Unit, engine: TileTransitionEngine): void {
    const effect = engine.terrainLayers.getGroundEffectAt(cell.col, cell.row);
    if (!effect) return;
    if (
        effect.effectType === BRAMBLE_SLOW_EFFECT_TYPE ||
        effect.effectType === DARK_THORN_EFFECT_TYPE
    ) {
        const dealt = applyThornDamage(
            unit,
            effect.effectType,
            effect.ownerUnitId ?? null,
            enterOrLandDamageFor(effect.effectType, 'land'),
            engine.eventBus,
        );
        destroyDarkThornAfterDamage(effect, dealt, engine.terrainLayers);
    }
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
