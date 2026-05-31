import type { Unit } from '../../game/units/Unit';
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
        for (const unit of hitUnits) {
            tryApplyKnockbackByTier(
                unit,
                this._knockbackTier,
                { unitId: ctx.caster.id, abilityId: ctx.abilityId },
                ctx.caster.x,
                ctx.caster.y,
                {
                    gameTime: eng.gameTime,
                    roundNumber: eng.roundNumber ?? 1,
                    eventBus: eng.eventBus,
                    interruptUnitAndRefundAbilities: eng.interruptUnitAndRefundAbilities?.bind(eng),
                },
            );
        }
    }
}
