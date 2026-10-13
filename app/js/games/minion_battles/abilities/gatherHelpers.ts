/**
 * Reusable "gather" building blocks: pick enemies in a cone nearest a cursor, and compute an arc
 * formation in front of the caster for them to land in. Pure geometry + selection (no ability state).
 */

import type { Unit } from '../game/units/Unit';
import { areEnemies } from '../game/teams';
import { pointInCone } from './coneGeometry';
import { filterCombatHitTargets } from './combatTargetFilter';
import { getDirectionFromTo } from './targetHelpers';

export interface SelectNearestToPointInConeOptions {
    caster: Pick<Unit, 'x' | 'y' | 'teamId'>;
    /** All units to consider (typically `engine.units`). */
    units: readonly Unit[];
    /** Point the cone is aimed toward (cone axis = caster -> aim). */
    aim: { x: number; y: number };
    /** Point candidates are ranked against (usually the cursor; often equal to `aim`). */
    cursor: { x: number; y: number };
    /** Cone length in px (from caster centre). */
    length: number;
    /** Total cone width in degrees. */
    widthDeg: number;
    maxTargets: number;
    /** Extra predicate applied after the default enemy/alive filter. */
    filter?: (unit: Unit) => boolean;
    /** When set, units with active iFrames (and dead/inactive/spawning units) are excluded. */
    gameTime?: number;
}

/**
 * Enemies inside the cone, sorted by distance to `cursor` (ties broken by unit id), capped at maxTargets.
 */
export function selectNearestToPointInCone(options: SelectNearestToPointInConeOptions): Unit[] {
    const { caster, units, aim, cursor, length, widthDeg, maxTargets, filter, gameTime } = options;
    const { dirX, dirY } = getDirectionFromTo(caster.x, caster.y, aim.x, aim.y);
    const half = ((widthDeg / 2) * Math.PI) / 180;
    let candidates = units.filter(
        (u) =>
            u.isAlive() &&
            areEnemies(caster.teamId, u.teamId) &&
            pointInCone(caster.x, caster.y, u.x, u.y, dirX, dirY, 0, length, half) &&
            (!filter || filter(u)),
    );
    if (gameTime != null) candidates = filterCombatHitTargets(candidates, gameTime);
    return candidates
        .map((unit) => ({ unit, d: (unit.x - cursor.x) ** 2 + (unit.y - cursor.y) ** 2 }))
        .sort((a, b) => a.d - b.d || (a.unit.id < b.unit.id ? -1 : a.unit.id > b.unit.id ? 1 : 0))
        .slice(0, Math.max(0, maxTargets))
        .map((e) => e.unit);
}

export interface ComputeArcLandingSlotsOptions {
    caster: { x: number; y: number; radius: number };
    /** Direction reference: slots are centred on caster -> aim. */
    aim: { x: number; y: number };
    count: number;
    /** Gap between the caster's edge and the slot centre (add target radius via `targetRadius`). */
    radiusFromEdge: number;
    /** Angular offset (degrees) of the outermost slots from the aim line. */
    spreadDeg: number;
    /** Added to the arc radius so units touch-but-don't-overlap the caster. Default 0. */
    targetRadius?: number;
}

/**
 * Ordered slot points on an arc in front of the caster: index 0 is the centre slot (for the
 * highest-priority target), then alternating +side / -side moving outward. The outermost ring sits at
 * +/- spreadDeg; intermediate rings are evenly spaced.
 */
export function computeArcLandingSlots(options: ComputeArcLandingSlotsOptions): { x: number; y: number }[] {
    const { caster, aim, count, radiusFromEdge, spreadDeg, targetRadius = 0 } = options;
    if (count <= 0) return [];
    const { dirX, dirY } = getDirectionFromTo(caster.x, caster.y, aim.x, aim.y);
    const baseAngle = Math.atan2(dirY, dirX);
    const radius = caster.radius + targetRadius + radiusFromEdge;
    const maxRing = Math.ceil((count - 1) / 2);
    const slots: { x: number; y: number }[] = [];
    for (let k = 0; k < count; k++) {
        const ring = Math.ceil(k / 2);
        const side = k % 2 === 1 ? 1 : -1;
        const offsetDeg = k === 0 || maxRing === 0 ? 0 : side * (ring / maxRing) * spreadDeg;
        const a = baseAngle + (offsetDeg * Math.PI) / 180;
        slots.push({ x: caster.x + Math.cos(a) * radius, y: caster.y + Math.sin(a) * radius });
    }
    return slots;
}
