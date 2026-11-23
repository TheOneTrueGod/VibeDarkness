/**
 * Exile: a unit temporarily out of play.
 *
 * An exiled unit is NOT in `UnitManager.units`, so ticks, AI, collision, rendering, targeting and pet lookups
 * (`getPetsOfUnit` scans `units`) skip it with no special cases. It lives in `UnitManager.exiledUnits` as an
 * {@link ExiledUnitRecord} until it returns. A pet's owner keeps it in `petState.unitIds`; an exiled pet is never
 * "free" because it is not in `units`.
 *
 * Entry points (also on `GameEngine` / `EngineContext`): `exileUnit`, `returnExiledUnit`, `getExiledUnit`,
 * `getExiledUnits`. Returns are data-driven: {@link tickExiledUnits} runs once per engine tick and returns a unit
 * whose `returnAtGameTime` has passed, or whose anchor unit died or vanished. Users that return the unit
 * themselves (e.g. Guard, when its shield ends) set `returnAtGameTime: null`; the timer is then only a fallback.
 */

import type { EngineContext } from '../EngineContext';
import type { EventBus } from '../EventBus';
import type { Unit } from './Unit';
import { restoreSerializedUnit } from './restoreSerializedUnit';

export interface ExiledUnitRecord {
    unit: Unit;
    /** Why the unit left play (e.g. `'guard'`); echoed on `unit_exiled` / `unit_returned`. */
    reason: string;
    exiledAtGameTime: number;
    /** Game time at which the unit returns by itself. Null = only an explicit return (or the anchor) brings it back. */
    returnAtGameTime: number | null;
    /** Unit the exiled unit returns at. When it dies or is gone, the unit returns at once at its last position. */
    anchorUnitId: string | null;
    /** Where the unit was when it left. Used when there is no anchor position. */
    exiledAtX: number;
    exiledAtY: number;
    /** The anchor's last known position, refreshed each tick while it is alive. Null while unknown. */
    anchorLastX: number | null;
    anchorLastY: number | null;
}

export interface ExileOptions {
    reason: string;
    anchorUnitId?: string | null;
    returnAtGameTime?: number | null;
}

export interface SerializedExiledUnitRecord {
    unit: Record<string, unknown>;
    reason: string;
    exiledAtGameTime: number;
    returnAtGameTime: number | null;
    anchorUnitId: string | null;
    exiledAtX: number;
    exiledAtY: number;
    anchorLastX: number | null;
    anchorLastY: number | null;
}

/** What the exile functions need from the unit manager (kept structural to avoid an import cycle). */
export interface ExileHost {
    units: Unit[];
    exiledUnits: ExiledUnitRecord[];
}

/**
 * Take `unit` out of play. Cancels its casts (no refund), clears its movement and moves it from `units` to
 * `exiledUnits`. Returns false (and does nothing) when the unit is not in play or is dead.
 */
export function exileUnitFrom(host: ExileHost, ctx: EngineContext, unit: Unit, opts: ExileOptions): boolean {
    const idx = host.units.indexOf(unit);
    if (idx < 0 || !unit.isAlive()) return false;
    for (const abilityId of unit.activeAbilities.map((a) => a.abilityId)) {
        unit.cancelActiveAbility(abilityId, ctx);
    }
    unit.clearMovement();
    host.units.splice(idx, 1);

    const anchorUnitId = opts.anchorUnitId ?? null;
    const anchor = anchorUnitId ? host.units.find((u) => u.id === anchorUnitId) : undefined;
    host.exiledUnits.push({
        unit,
        reason: opts.reason,
        exiledAtGameTime: ctx.gameTime,
        returnAtGameTime: opts.returnAtGameTime ?? null,
        anchorUnitId,
        exiledAtX: unit.x,
        exiledAtY: unit.y,
        anchorLastX: anchor ? anchor.x : null,
        anchorLastY: anchor ? anchor.y : null,
    });
    ctx.eventBus.emit('unit_exiled', {
        unitId: unit.id,
        reason: opts.reason,
        x: unit.x,
        y: unit.y,
        anchorUnitId,
    });
    return true;
}

/**
 * Put an exiled unit back in play at `at` (default: the anchor's last position, else where it left). Clears its
 * movement and AI plan and emits `unit_returned`. Does nothing for an id that is not exiled. Returns whether it
 * returned a unit.
 */
export function returnExiledUnitTo(
    host: ExileHost,
    ctx: EngineContext,
    unitId: string,
    at?: { x: number; y: number },
): boolean {
    const idx = host.exiledUnits.findIndex((r) => r.unit.id === unitId);
    if (idx < 0) return false;
    const record = host.exiledUnits[idx]!;
    host.exiledUnits.splice(idx, 1);
    const unit = record.unit;
    const x = at?.x ?? record.anchorLastX ?? record.exiledAtX;
    const y = at?.y ?? record.anchorLastY ?? record.exiledAtY;
    unit.x = x;
    unit.y = y;
    unit.clearMovement();
    unit.tacticalPlan = null;
    unit.pendingInterrupts.clear();
    unit.pathInvalidated = true;
    host.units.push(unit);
    ctx.eventBus.emit('unit_returned', {
        unitId: unit.id,
        reason: record.reason,
        x,
        y,
        anchorUnitId: record.anchorUnitId,
    });
    return true;
}

/**
 * The one per-tick check. Refreshes each record's anchor position, then returns every unit whose timer is up
 * (at its anchor, or where it left) or whose anchor is dead or gone (at the anchor's last position).
 */
export function tickExiledUnits(host: ExileHost, ctx: EngineContext): void {
    if (host.exiledUnits.length === 0) return;
    const due: string[] = [];
    for (const record of host.exiledUnits) {
        const anchor = record.anchorUnitId ? host.units.find((u) => u.id === record.anchorUnitId) : undefined;
        const anchorAlive = anchor !== undefined && anchor.isAlive();
        if (anchor && anchorAlive) {
            record.anchorLastX = anchor.x;
            record.anchorLastY = anchor.y;
        }
        const anchorGone = record.anchorUnitId !== null && !anchorAlive;
        const timerUp = record.returnAtGameTime !== null && ctx.gameTime >= record.returnAtGameTime;
        if (anchorGone || timerUp) due.push(record.unit.id);
    }
    for (const id of due) returnExiledUnitTo(host, ctx, id);
}

export function serializeExiledUnits(records: readonly ExiledUnitRecord[], currentGameTick: number): SerializedExiledUnitRecord[] {
    return records.map((r) => ({
        unit: r.unit.toJSON(currentGameTick),
        reason: r.reason,
        exiledAtGameTime: r.exiledAtGameTime,
        returnAtGameTime: r.returnAtGameTime,
        anchorUnitId: r.anchorUnitId,
        exiledAtX: r.exiledAtX,
        exiledAtY: r.exiledAtY,
        anchorLastX: r.anchorLastX,
        anchorLastY: r.anchorLastY,
    }));
}

export function restoreExiledUnits(
    data: readonly SerializedExiledUnitRecord[] | undefined,
    eventBus: EventBus,
    currentGameTick: number,
    ctx?: EngineContext,
): ExiledUnitRecord[] {
    return (data ?? []).map((d) => ({
        unit: restoreSerializedUnit(d.unit, eventBus, currentGameTick, ctx),
        reason: d.reason,
        exiledAtGameTime: d.exiledAtGameTime,
        returnAtGameTime: d.returnAtGameTime,
        anchorUnitId: d.anchorUnitId,
        exiledAtX: d.exiledAtX,
        exiledAtY: d.exiledAtY,
        anchorLastX: d.anchorLastX,
        anchorLastY: d.anchorLastY,
    }));
}
