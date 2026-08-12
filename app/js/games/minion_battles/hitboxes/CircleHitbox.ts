import type { Unit } from '../game/units/Unit';
import { Hitbox, type HitboxEngineContext } from './Hitbox';
import { areEnemies } from '../game/teams';
import { filterCombatHitTargets } from '../abilities/combatTargetFilter';

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
            const dx = unit.x - cx;
            const dy = unit.y - cy;
            if (Math.sqrt(dx * dx + dy * dy) <= range) {
                result.push(unit);
            }
        }
        return filterCombatHitTargets(result, engine.gameTime);
    }
}
