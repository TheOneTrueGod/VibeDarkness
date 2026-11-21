import type { Unit } from '../game/units/Unit';
import { Hitbox, type HitboxEngineContext } from './Hitbox';
import { canHit, type HitRule } from '../game/hitRule';
import { filterCombatHitTargets } from '../abilities/combatTargetFilter';

/** True when `unit`'s collision circle overlaps a disk of `radius` at (cx, cy). */
export function unitOverlapsCircle(
    unit: Pick<Unit, 'x' | 'y' | 'radius'>,
    cx: number,
    cy: number,
    radius: number,
): boolean {
    return Math.hypot(unit.x - cx, unit.y - cy) <= radius + unit.radius;
}

export abstract class CircleHitbox extends Hitbox {
    static getUnitsInHitbox(
        engine: HitboxEngineContext,
        caster: Unit,
        cx: number,
        cy: number,
        range: number,
        /** Who may be hit; default `hostile` (enemies of the caster). */
        hitRule?: HitRule,
    ): Unit[] {
        const result: Unit[] = [];
        for (const unit of engine.units) {
            if (!unit.active || !unit.isAlive() || unit.isUntargetable()) continue;
            if (!canHit(hitRule, caster.teamId, unit)) continue;
            if (unit.id === caster.id) continue;
            if (unitOverlapsCircle(unit, cx, cy, range)) {
                result.push(unit);
            }
        }
        return filterCombatHitTargets(result, engine.gameTime);
    }
}
