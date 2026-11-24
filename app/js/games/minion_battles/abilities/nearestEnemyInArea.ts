/**
 * Kept free of `blockingHelpers` (and so of `AbilityRegistry`) so `previewHelpers`, which every card imports,
 * can use it without an import cycle. Re-exported from `targetHelpers`.
 */
import { areEnemies } from '../game/teams';
import type { Unit } from '../game/units/Unit';

/**
 * The living, active enemy of `caster` whose edge is nearest `point`, within `radius` px of it (edge distance),
 * or null. The "point target picks the enemy there" rule (e.g. `DashStrike.withAreaTargeting`).
 */
export function findNearestEnemyInArea(
    units: readonly Unit[],
    caster: Unit,
    point: { x: number; y: number },
    radius: number,
): Unit | null {
    let best: Unit | null = null;
    let bestDist = Infinity;
    for (const unit of units) {
        if (!unit.active || !unit.isAlive() || unit.id === caster.id) continue;
        if (!areEnemies(caster.teamId, unit.teamId)) continue;
        const dist = Math.hypot(unit.x - point.x, unit.y - point.y) - unit.radius;
        if (dist > radius || dist >= bestDist) continue;
        best = unit;
        bestDist = dist;
    }
    return best;
}
