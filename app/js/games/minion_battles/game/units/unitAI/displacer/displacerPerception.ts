/**
 * Shared perception helper for the Displacer family AI nodes.
 */

import type { Unit } from '../../Unit';
import type { AIContext } from '../types';
import { findEnemies, getEnemiesInPerceptionAndLOS } from '../utils';
import { getPerceptionRange } from '../../unit_defs/unitDef';

/** Enemies the unit can currently see, nearest first. */
export function getVisibleEnemiesNearestFirst(unit: Unit, context: AIContext, sightRadius?: number): Unit[] {
    const radius = sightRadius ?? getPerceptionRange(unit.characterId);
    return getEnemiesInPerceptionAndLOS(
        unit,
        findEnemies(unit, context.getUnits()),
        radius,
        context.hasLineOfSight.bind(context),
    );
}

/**
 * Living hostile units within perception range, nearest first, IGNORING line of sight.
 * Once the Displacer family has engaged it keeps hunting these (walking around cover) instead of
 * standing still when a rock blocks the view; casting still uses the line-of-sight list above.
 */
export function getEnemiesInRangeNearestFirst(unit: Unit, context: AIContext, sightRadius?: number): Unit[] {
    const radius = sightRadius ?? getPerceptionRange(unit.characterId);
    return findEnemies(unit, context.getUnits())
        .filter((e) => Math.hypot(e.x - unit.x, e.y - unit.y) <= radius)
        .sort((a, b) => Math.hypot(a.x - unit.x, a.y - unit.y) - Math.hypot(b.x - unit.x, b.y - unit.y));
}
