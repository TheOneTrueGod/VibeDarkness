import type { Unit } from '../../game/units/Unit';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import {
    tryApplyKnockbackByTier,
    knockbackCtxFromEngine,
    type KnockbackLaunchOpts,
} from '../../crowdControl/knockbackKeywords';
import { tryDamageOrBlock, type TryDamageOrBlockParams } from '../blockingHelpers';

/**
 * Shared base for attack CastBehaviours (melee, ranged, etc.).
 * Provides withKnockback(), declarative withDamage(amount), onDamage(), and onBlocked().
 */
export abstract class BaseAttackBehaviour {
    private _knockbackTier: number | null = null;
    private _knockbackOpts: KnockbackLaunchOpts | undefined = undefined;
    private _damageAmount: number | null = null;
    private _damageResolver: ((ctx: CastBehaviourTickContext, unit: Unit) => number) | null = null;
    private _damageAttackType: TryDamageOrBlockParams['attackType'] = 'melee';
    private _onDamageHook: ((ctx: CastBehaviourTickContext, unit: Unit, amountDealt: number) => void) | null = null;
    private _onBlockedHook: ((ctx: CastBehaviourTickContext, unit: Unit) => void) | null = null;

    /** `opts.magnitudeScale` nudges the launch distance without changing the tier (see `KnockbackLaunchOpts`). */
    withKnockback(tier: number, opts?: Pick<KnockbackLaunchOpts, 'magnitudeScale'>): this {
        this._knockbackTier = tier;
        this._knockbackOpts = opts;
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

    protected setDeclarativeDamageResolver(
        fn: (ctx: CastBehaviourTickContext, unit: Unit) => number,
        attackType: TryDamageOrBlockParams['attackType'],
    ): void {
        this._damageResolver = fn;
        this._damageAttackType = attackType;
    }

    protected get hasDeclarativeDamage(): boolean {
        return this._damageAmount !== null || this._damageResolver !== null;
    }

    /** Run tryDamageOrBlock for each hit unit, then fire onDamage/onBlocked hooks. */
    protected runDeclarativeDamage(hitUnits: Unit[], ctx: CastBehaviourTickContext): void {
        if ((this._damageAmount === null && this._damageResolver === null) || hitUnits.length === 0) return;
        for (const unit of hitUnits) {
            const damage = this._damageResolver !== null
                ? this._damageResolver(ctx, unit)
                : this._damageAmount!;
            const outcome = tryDamageOrBlock(unit, {
                engine: ctx.engine,
                gameTime: ctx.engine.gameTime,
                eventBus: ctx.engine.eventBus,
                attackerX: ctx.caster.x,
                attackerY: ctx.caster.y,
                attackerId: ctx.caster.id,
                abilityId: ctx.abilityId,
                damage,
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
        const engineCtx = knockbackCtxFromEngine(ctx.engine as AbilityEngineContext);
        const source = { unitId: ctx.caster.id, abilityId: ctx.abilityId };
        // A stack is knocked back as one token (see `game/units/stackRules.ts`).
        const knocked = new Set<string>();
        for (const unit of hitUnits) {
            if (knocked.has(unit.id)) continue;
            knocked.add(unit.id);
            tryApplyKnockbackByTier(unit, this._knockbackTier, source, ctx.caster.x, ctx.caster.y, engineCtx, this._knockbackOpts);
        }
    }
}
