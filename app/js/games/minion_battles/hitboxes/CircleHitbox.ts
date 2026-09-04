import type { Unit } from '../game/units/Unit';
import { Hitbox, type HitboxEngineContext } from './Hitbox';
import { areEnemies } from '../game/teams';
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
    ): Unit[] {
        const result: Unit[] = [];
        for (const unit of engine.units) {
            if (!unit.active || !unit.isAlive() || unit.isSpawning()) continue;
            if (!areEnemies(caster.teamId, unit.teamId)) continue;
            if (unit.id === caster.id) continue;
            if (unitOverlapsCircle(unit, cx, cy, range)) {
                result.push(unit);
            }
        }
        return filterCombatHitTargets(result, engine.gameTime);
    }
}
