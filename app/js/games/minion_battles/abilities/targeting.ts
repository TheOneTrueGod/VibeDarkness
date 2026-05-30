/**
 * Targeting system for abilities.
 *
 * Defines target types, target definitions, and helpers
 * for validating and resolving click targets.
 */

import type { Unit } from '../game/units/Unit';
import type { Camera } from '../game/Camera';
import type { ResolvedTarget } from '../game/types';
import type { HitboxDef } from './hitboxDef';
import type { AbilityStatic } from './Ability';
import type { SelectTargetDef } from './timingTargetDef';
import { isSelectTargetDef } from './timingTargetDef';
import { isAbilityTimingInterval } from './abilityTimings';

/** The types of targets an ability can require. */
export type TargetType = 'player' | 'unit' | 'pixel';

export interface LockOnDef {
    hitbox: HitboxDef;
    filter: 'enemy' | 'ally' | 'any';
    allowMiss?: boolean; // true = fall back to pixel on no unit found (default); false = click is invalid
}

/** Describes one required target for an ability. */
export interface TargetDef {
    type?: TargetType; // Optional when lockOn is present; defaults to 'pixel'
    label: string;
    lockOn?: LockOnDef;
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
 */
export function getSelectTargetDefsFromTimings(ability: AbilityStatic): SelectTargetDef[] {
    // Use raw timing entries (before normalisation/coop-tail-split) so that
    // targetDef fields are never accidentally stripped by applyCoopTailSplit.
    const entries = ability.getAbilityTimings
        ? ability.getAbilityTimings()
        : ability.abilityTimings;
    const result: SelectTargetDef[] = [];
    for (const entry of entries) {
        if (isAbilityTimingInterval(entry) && entry.targetDef && isSelectTargetDef(entry.targetDef)) {
            result.push(entry.targetDef);
        }
    }
    return result;
}

/**
 * Validate that a click result matches the required target type.
 * Returns a ResolvedTarget if valid, or null if not.
 */
export function validateAndResolveTarget(
    targetDef: TargetDef,
    clickResult: ClickResult,
): ResolvedTarget | null {
    const targetType = targetDef.type ?? 'pixel';
    switch (targetType) {
        case 'pixel':
            // Any click on the canvas is valid
            return {
                type: 'pixel',
                position: clickResult.worldPosition,
            };

        case 'unit':
            // Must have clicked on a unit
            if (!clickResult.unit) return null;
            return {
                type: 'unit',
                unitId: clickResult.unit.id,
            };

        case 'player':
            // Must have clicked on a player-owned unit
            if (!clickResult.unit || !clickResult.unit.isPlayerControlled()) return null;
            return {
                type: 'player',
                playerId: clickResult.unit.ownerId,
                unitId: clickResult.unit.id,
            };

        default:
            return null;
    }
}
