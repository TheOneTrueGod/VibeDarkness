/**
 * Scout construction start — shared by the scout's AI (`lnet_scout_travel`) and the per-tick nest
 * pass (`processLanterniteNests`), so a scout starts building on the exact tick it reaches its stand
 * position instead of idling until its next AI turn (up to a full wait window later).
 */

import type { Unit } from '../../Unit';
import { distance, findEnemies } from '../utils';
import { lanterniteStateOf, peekLanterniteState } from '../../components/lanterniteComponent';
import { CELL_SIZE } from '../../../../terrain/TerrainGrid';

/** Within this distance (px) of the stand position the scout has arrived. */
export const SCOUT_ARRIVAL_PX = 36;

/**
 * Once the scout has finished walking (no path, no goal), it counts as arrived anywhere within this
 * distance of the stand position. Covers a stand point inside a blocked cell (the walk goal snaps to
 * the nearest passable cell) or crowd spacing nudging the scout off the exact spot.
 */
const SCOUT_SETTLED_ARRIVAL_PX = CELL_SIZE * 1.5;

const DEFAULT_CONSTRUCTION_SEC = 10;

/**
 * Distance (px) from the nest build site where the scout stands while constructing.
 * Using a slight offset so the scout doesn't overlap the future nest sprite.
 */
const CONSTRUCTION_STAND_RADIUS = 56;

/**
 * Distance (px) from the build site within which a hostile presence (e.g. a rival
 * `swarm_nest` and its swarmlings) contests the spot and blocks construction.
 */
const CONTEST_RADIUS_PX = 160;

/** True if a hostile unit is within the contest radius of the build site. */
export function isNestSiteContested(unit: Unit, siteX: number, siteY: number, units: Unit[]): boolean {
    return findEnemies(unit, units).some((e) => distance(siteX, siteY, e.x, e.y) <= CONTEST_RADIUS_PX);
}

/**
 * Where the scout stands while building: offset from the build site at the scout's assigned angle.
 * Each scout has a unique angle (set at spawn) so multiple scouts from the same nest encircle the
 * build site rather than piling on top of each other. Null when the scout has no build site.
 */
export function getScoutStandPosition(unit: Unit): { x: number; y: number } | null {
    const far = peekLanterniteState(unit)?.patrolFarWorld;
    if (!far) return null;
    const angle = lanterniteStateOf(unit).constructionAngle ?? 0;
    return {
        x: far.x + Math.cos(angle) * CONSTRUCTION_STAND_RADIUS,
        y: far.y + Math.sin(angle) * CONSTRUCTION_STAND_RADIUS,
    };
}

function hasArrivedAtStand(unit: Unit, stand: { x: number; y: number }): boolean {
    const d = distance(unit.x, unit.y, stand.x, stand.y);
    if (d < SCOUT_ARRIVAL_PX) return true;
    const settled = !unit.movement && !unit.walkIntent;
    return settled && d < SCOUT_SETTLED_ARRIVAL_PX;
}

/**
 * Start (or join) construction if the scout has reached its stand position and the site isn't
 * contested. While contested, no build progress is made or animated; the scout's opportunistic
 * attack keeps firing, so it fights for the spot instead of building on top of the enemy.
 *
 * Returns true when construction is under way after the call (including when it already was).
 */
export function tryBeginScoutConstruction(unit: Unit, units: Unit[], gameTime: number): boolean {
    if (!unit.isAlive()) return false;
    const state = peekLanterniteState(unit);
    if (!state || state.role !== 'scout') return false;
    if (state.constructionCompleteAtGameTime != null) return true;

    const far = state.patrolFarWorld;
    const stand = getScoutStandPosition(unit);
    if (!far || !stand) return false;
    if (!hasArrivedAtStand(unit, stand)) return false;
    if (isNestSiteContested(unit, far.x, far.y, units)) return false;

    // If another scout is already building at this same POI, join its build instead of starting a
    // fresh timer — processLanterniteNests accelerates the shared completion time based on how many
    // scouts are contributing, and only one of us will spawn the actual nest once it's done.
    const targetPoiId = state.targetNestPoiId;
    const existingBuilder = targetPoiId
        ? units.find(
              (u) =>
                  u.id !== unit.id &&
                  u.isAlive() &&
                  peekLanterniteState(u)?.targetNestPoiId === targetPoiId &&
                  peekLanterniteState(u)?.constructionCompleteAtGameTime != null,
          )
        : undefined;
    if (existingBuilder) {
        state.constructionCompleteAtGameTime = lanterniteStateOf(existingBuilder).constructionCompleteAtGameTime;
    } else {
        const constructionSec = state.nestConfig?.scoutConstructionSec ?? DEFAULT_CONSTRUCTION_SEC;
        state.constructionCompleteAtGameTime = gameTime + constructionSec;
    }
    // Plant the scout where it is: it builds from here rather than finishing the walk to a cell centre.
    unit.clearMovement();
    return true;
}
