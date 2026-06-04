import { Unit } from '../../game/units/Unit';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import { tryApplyKnockbackByTier } from '../../crowdControl/knockbackKeywords';

interface KnockbackCapableEngine extends AbilityEngineContext {
    roundNumber?: number;
    interruptUnitAndRefundAbilities?(unit: Unit): void;
}

/**
 * Shared base for attack CastBehaviours (melee, ranged, etc.).
 * Provides withKnockback(); future attack behaviours extend this class and get it for free.
 */
export abstract class BaseAttackBehaviour {
    private _knockbackTier: number | null = null;

    withKnockback(tier: number): this {
        this._knockbackTier = tier;
        return this;
    }

    protected applyKnockbackToHits(hitUnits: Unit[], ctx: CastBehaviourTickContext): void {
        if (this._knockbackTier === null || hitUnits.length === 0) return;
        const eng = ctx.engine as KnockbackCapableEngine;
        const engineCtx = {
            gameTime: eng.gameTime,
            roundNumber: eng.roundNumber ?? 1,
            eventBus: eng.eventBus,
            interruptUnitAndRefundAbilities: eng.interruptUnitAndRefundAbilities?.bind(eng),
        };

        // Count how many hit slots each unit received (stacks may appear multiple times).
        const hitCountById = new Map<string, { unit: Unit; count: number }>();
        for (const u of hitUnits) {
            const entry = hitCountById.get(u.id);
            if (entry) entry.count++;
            else hitCountById.set(u.id, { unit: u, count: 1 });
        }

        const source = { unitId: ctx.caster.id, abilityId: ctx.abilityId };

        for (const { unit, count } of hitCountById.values()) {
            // For stacks with more members than hit slots, split off the hit units and
            // knock back only the split group; the remaining stack stays in place.
            if (unit.stackSize > 1 && count < unit.stackSize && eng.addUnit) {
                const splitUnit = new Unit({
                    x: unit.x,
                    y: unit.y,
                    hp: unit.maxHp,
                    maxHp: unit.maxHp,
                    speed: unit.speed,
                    teamId: unit.teamId,
                    ownerId: unit.ownerId,
                    characterId: unit.characterId,
                    name: unit.name,
                    abilities: [...unit.abilities],
                    aiSettings: unit.aiSettings,
                    radius: unit.radius,
                    stamina: unit.stamina,
                    combatSettings: unit.combatSettings,
                    unitAITreeId: unit.unitAITreeId,
                    stackSize: count,
                });
                unit.stackSize -= count;
                eng.addUnit(splitUnit, 'abilitySpawn');
                tryApplyKnockbackByTier(splitUnit, this._knockbackTier, source, ctx.caster.x, ctx.caster.y, engineCtx);
            } else {
                tryApplyKnockbackByTier(unit, this._knockbackTier, source, ctx.caster.x, ctx.caster.y, engineCtx);
            }
        }
    }
}
