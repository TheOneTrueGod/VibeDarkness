/**
 * Targeting system for abilities.
 *
 * Defines target types, target definitions, and helpers
 * for validating and resolving click targets.
 */

import type { Unit } from '../game/units/Unit';
import type { Camera } from '../game/Camera';
import type { ResolvedTarget } from '../game/types';
import type { AbilityStatic, IAbilityPreviewGraphics } from './Ability';
import type { SelectTargetDef } from './timingTargetDef';
import { isSelectTargetDef } from './timingTargetDef';
import { isAbilityTimingInterval } from './abilityTimings';
import { areEnemies, areAllies } from '../game/teams';

/** The types of targets an ability can require. */
export type TargetType = 'player' | 'unit' | 'pixel';

/** Describes one required target for an ability. */
export interface TargetDef {
    type?: TargetType; // defaults to 'pixel'
    label: string;
}

/** Result of resolving a click on the canvas. */
export interface ClickResult {
    /** The unit clicked on, if any. */
    unit: Unit | null;
    /** The world-space position of the click. */
    worldPosition: { x: number; y: number };
}

/**
 * Resolve a screen-space click to a world-space position and
 * optionally the unit at that position.
 */
export function resolveClick(
    screenX: number,
    screenY: number,
    camera: Camera,
    units: Unit[],
): ClickResult {
    const worldPos = camera.screenToWorld(screenX, screenY);
    let closestUnit: Unit | null = null;
    let closestDist = Infinity;

    for (const unit of units) {
        if (!unit.isAlive()) continue;
        const dx = unit.x - worldPos.x;
        const dy = unit.y - worldPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= unit.radius && dist < closestDist) {
            closestDist = dist;
            closestUnit = unit;
        }
    }

    return { unit: closestUnit, worldPosition: worldPos };
}

/**
 * Find the unit at the given world position (closest if multiple overlap).
 */
export function getUnitAtPosition(worldPos: { x: number; y: number }, units: Unit[]): Unit | null {
    let closestUnit: Unit | null = null;
    let closestDist = Infinity;

    for (const unit of units) {
        if (!unit.isAlive()) continue;
        const dx = unit.x - worldPos.x;
        const dy = unit.y - worldPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= unit.radius && dist < closestDist) {
            closestDist = dist;
            closestUnit = unit;
        }
    }

    return closestUnit;
}

/**
 * Collect all `SelectTargetDef` entries from an ability's timing intervals, in declaration order.
 *
 * For new-style abilities that declare per-timing `targetDef: { kind: 'select', ... }`, this gives
 * the ordered click sequence to drive target collection in the UI (replacing `getAbilityTargets`).
 * Returns an empty array for legacy abilities that do not use per-timing target defs.
 *
 * Pass `caster` and `engine` so that research-dependent `getAbilityTimings` overrides (e.g.
 * More Rock dual-throw) return the correct interval set for the current player.
 */
export function getSelectTargetDefsFromTimings(
    ability: AbilityStatic,
    caster?: Unit,
    engine?: unknown,
): SelectTargetDef[] {
    // Use raw timing entries (before normalisation/coop-tail-split) so that
    // targetDef fields are never accidentally stripped by applyCoopTailSplit.
    const entries = ability.getAbilityTimings
        ? ability.getAbilityTimings(caster, engine)
        : ability.abilityTimings;
    const result: SelectTargetDef[] = [];
    for (const entry of entries) {
        if (isAbilityTimingInterval(entry) && entry.targetDef && isSelectTargetDef(entry.targetDef)) {
            result.push(entry.targetDef);
        }
    }
    return result;
}

/** Draw red highlight rings around units that will be hit by the current targeting preview. */
export function renderMeleeTrackingHighlights(gr: IAbilityPreviewGraphics, hitUnits: Unit[]): void {
    for (const unit of hitUnits) {
        gr.circle(unit.x, unit.y, unit.radius + 4);
        gr.stroke({ color: 0xff2222, width: 2.5, alpha: 0.4 });
    }
}

/**
 * Filter a candidate unit list by a `SelectTargetDef.filter` value and exclude the caster.
 *
 * Call this after `HitboxSpec.renderTargetingPreview` (which does NOT self-exclude) and
 * after `HitboxSpec.resolveTargets` (which self-excludes but does NOT team-filter).
 * Safe to call on already-self-excluded lists — the caster check is a no-op in that case.
 */
export function filterSelectTargetCandidates(
    units: Unit[],
    caster: Pick<Unit, 'id' | 'teamId'>,
    filter: SelectTargetDef['filter'],
): Unit[] {
    return units.filter(u => {
        if (u.id === caster.id) return false;
        if (filter === 'enemy') return areEnemies(caster.teamId, u.teamId);
        if (filter === 'ally')  return areAllies(caster.teamId, u.teamId);
        return true; // 'any'
    });
}

/** Convert a committed `ResolvedTarget` to a world-space point, or null if unresolvable. */
export function resolveTargetToPoint(
    target: ResolvedTarget,
    engine: { getUnit(id: string): { x: number; y: number } | undefined | null },
): { x: number; y: number } | null {
    if (target.type === 'unit' && target.unitId) {
        const u = engine.getUnit(target.unitId);
        return u ? { x: u.x, y: u.y } : null;
    }
    if (target.type === 'pixel' && target.position) {
        return target.position;
    }
    return null;
}
