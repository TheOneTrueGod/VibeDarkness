import { Unit } from '../../game/units/Unit';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import { tryApplyKnockbackByTier, knockbackCtxFromEngine } from '../../crowdControl/knockbackKeywords';
import { tryDamageOrBlock, type TryDamageOrBlockParams } from '../blockingHelpers';

/**
 * Shared base for attack CastBehaviours (melee, ranged, etc.).
 * Provides withKnockback(), declarative withDamage(amount), onDamage(), and onBlocked().
 */
export abstract class BaseAttackBehaviour {
    private _knockbackTier: number | null = null;
    private _damageAmount: number | null = null;
    private _damageAttackType: TryDamageOrBlockParams['attackType'] = 'melee';
    private _onDamageHook: ((ctx: CastBehaviourTickContext, unit: Unit, amountDealt: number) => void) | null = null;
    private _onBlockedHook: ((ctx: CastBehaviourTickContext, unit: Unit) => void) | null = null;

    withKnockback(tier: number): this {
        this._knockbackTier = tier;
        return this;
    }

    /** Called for each unit that actually took damage (post-block). Only fires on the declarative damage path. */
    onDamage(fn: (ctx: CastBehaviourTickContext, unit: Unit, amountDealt: number) => void): this {
        this._onDamageHook = fn;
        return this;
    }

    /** Called for each unit whose attack was blocked. Only fires on the declarative damage path. */
    onBlocked(fn: (ctx: CastBehaviourTickContext, unit: Unit) => void): this {
        this._onBlockedHook = fn;
        return this;
    }

    protected setDeclarativeDamage(amount: number, attackType: TryDamageOrBlockParams['attackType']): void {
        this._damageAmount = amount;
        this._damageAttackType = attackType;
    }

    protected get hasDeclarativeDamage(): boolean {
        return this._damageAmount !== null;
    }

    /** Run tryDamageOrBlock for each hit unit, then fire onDamage/onBlocked hooks. */
    protected runDeclarativeDamage(hitUnits: Unit[], ctx: CastBehaviourTickContext): void {
        if (this._damageAmount === null || hitUnits.length === 0) return;
        for (const unit of hitUnits) {
            const outcome = tryDamageOrBlock(unit, {
                engine: ctx.engine,
                gameTime: ctx.engine.gameTime,
                eventBus: ctx.engine.eventBus,
                attackerX: ctx.caster.x,
                attackerY: ctx.caster.y,
                attackerId: ctx.caster.id,
                abilityId: ctx.abilityId,
                damage: this._damageAmount,
                attackType: this._damageAttackType,
            });
            if (outcome.hit) {
                this._onDamageHook?.(ctx, unit, outcome.amountDealt);
            } else {
                this._onBlockedHook?.(ctx, unit);
            }
        }
    }

    protected applyKnockbackToHits(hitUnits: Unit[], ctx: CastBehaviourTickContext): void {
        if (this._knockbackTier === null || hitUnits.length === 0) return;
        const eng = ctx.engine as AbilityEngineContext;
        const engineCtx = knockbackCtxFromEngine(eng);

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
