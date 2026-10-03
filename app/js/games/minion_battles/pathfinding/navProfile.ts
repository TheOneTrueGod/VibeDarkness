/**
 * navProfile - Determines which nav profile a unit should use.
 *
 * A nav profile controls which cells are passable: `default` uses terrain only,
 * while `enemy` additionally blocks crystal-protected cells.
 */

import type { Unit } from '../game/units/Unit';
import { areEnemies } from '../game/teams';

export type NavProfileId = 'default' | 'enemy';

/**
 * Determine the nav profile for a unit.
 * Enemy units (units on a team that is an enemy to 'player') use the `enemy` profile
 * (which blocks crystal-protected cells). Everyone else uses `default`.
 */
export function getNavProfileForUnit(unit: Unit): NavProfileId {
    if (areEnemies(unit.teamId, 'player')) {
        return 'enemy';
    }
    return 'default';
}
