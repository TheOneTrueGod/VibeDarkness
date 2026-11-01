/**
 * Arc segment: the part of a ring (annulus) between two angles. A unit is in it when its circle
 * overlaps the ring (see `unitOverlapsRing`) and its centre, widened by its radius, falls inside
 * the angle span. Arc sweeps use one per step so the hit follows the drawn segment.
 */
import type { Unit } from '../game/units/Unit';
import { areEnemies } from '../game/teams';
import { filterCombatHitTargets } from '../abilities/combatTargetFilter';
import type { HitboxEngineContext } from './Hitbox';
import { unitOverlapsRing } from './RingHitbox';

export interface ArcSegment {
    x: number;
    y: number;
    innerRadius: number;
    outerRadius: number;
    /** Radians, screen space (y down). */
    startAngle: number;
    /** Signed span in radians; negative sweeps the other way. */
    sweepAngle: number;
}

export function unitOverlapsArcSegment(unit: Pick<Unit, 'x' | 'y' | 'radius'>, segment: ArcSegment): boolean {
    if (!unitOverlapsRing(unit, segment.x, segment.y, segment.innerRadius, segment.outerRadius)) return false;
    const dx = unit.x - segment.x;
    const dy = unit.y - segment.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= unit.radius) return true;
    const halfSpan = Math.abs(segment.sweepAngle) / 2;
    const mid = segment.startAngle + segment.sweepAngle / 2;
    const slack = Math.asin(Math.min(1, unit.radius / dist));
    return Math.abs(wrapAngle(Math.atan2(dy, dx) - mid)) <= halfSpan + slack;
}

/** Live enemies of `caster` in the segment, after the combat filter (iFrames, spawning). */
export function getUnitsInArcSegment(engine: HitboxEngineContext, caster: Unit, segment: ArcSegment): Unit[] {
    const result: Unit[] = [];
    for (const unit of engine.units) {
        if (!unit.active || !unit.isAlive() || unit.isUntargetable()) continue;
        if (unit.id === caster.id || !areEnemies(caster.teamId, unit.teamId)) continue;
        if (unitOverlapsArcSegment(unit, segment)) result.push(unit);
    }
    return filterCombatHitTargets(result, engine.gameTime);
}

/** Angle wrapped to (-PI, PI]. */
function wrapAngle(angle: number): number {
    let a = angle % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a <= -Math.PI) a += Math.PI * 2;
    return a;
}
