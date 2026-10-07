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
