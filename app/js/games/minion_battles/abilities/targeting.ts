/**
 * Targeting system for abilities.
 *
 * Defines target types, target definitions, and helpers
 * for validating and resolving click targets.
 */

import type { Unit } from '../objects/Unit';
import type { Camera } from '../engine/Camera';
import type { ResolvedTarget } from '../engine/types';

/** The types of targets an ability can require. */
export type TargetType = 'player' | 'unit' | 'pixel';

/** Describes one required target for an ability. */
export interface TargetDef {
    type: TargetType;
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
 * Validate that a click result matches the required target type.
 * Returns a ResolvedTarget if valid, or null if not.
 */
export function validateAndResolveTarget(
    targetDef: TargetDef,
    clickResult: ClickResult,
): ResolvedTarget | null {
    switch (targetDef.type) {
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
