/**
 * One area hit on one unit, away from a point that is not the caster: damage (blockable), then
 * knockback away from the point and a stun that interrupts, only when the hit landed.
 * Echo bursts and arc sweeps share it so a strike feels the same wherever it lands.
 */
import type { EventBus } from '../game/EventBus';
import type { EngineContext } from '../game/EngineContext';
import type { Unit } from '../game/units/Unit';
import { tryDamageOrBlock } from './blockingHelpers';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../crowdControl/knockbackKeywords';
import { tryApplyHardCcStun } from '../crowdControl/tryApplyHardCcStun';

export interface AreaStrikeSpec {
    damage: number;
    /** Knockback tier, pushing away from the strike's origin. */
    knockbackTier?: number;
    stunSeconds?: number;
    /** CC armour charges the stun spends. Default 1. */
    stunCcCharges?: number;
}

export interface AreaStrikeEngine {
    units: Unit[];
    gameTime: number;
    roundNumber?: number;
    eventBus: EventBus;
    getUnit?(id: string): Unit | undefined;
}

/** Strike `unit` from `origin`. Returns whether the damage landed (not blocked). */
export function landAreaStrike(
    engine: unknown,
    caster: Unit,
    abilityId: string,
    origin: { x: number; y: number },
    unit: Unit,
    strike: AreaStrikeSpec,
): boolean {
    const eng = engine as AreaStrikeEngine;
    const outcome = tryDamageOrBlock(unit, {
        engine: eng,
        gameTime: eng.gameTime,
        eventBus: eng.eventBus,
        attackerX: origin.x,
        attackerY: origin.y,
        attackerId: caster.id,
        abilityId,
        damage: strike.damage,
        attackType: 'melee',
    });
    if (!outcome.hit) return false;
    if (strike.knockbackTier != null) {
        tryApplyKnockbackByTier(
            unit,
            strike.knockbackTier,
            { unitId: caster.id, abilityId },
            origin.x,
            origin.y,
            knockbackCtxFromEngine(eng as Parameters<typeof knockbackCtxFromEngine>[0]),
        );
    }
    if (strike.stunSeconds != null) {
        const stun = tryApplyHardCcStun(
            unit,
            strike.stunSeconds,
            eng.gameTime,
            eng.roundNumber ?? 0,
            eng.eventBus,
            strike.stunCcCharges ?? 1,
        );
        if (stun.outcome === 'applied') unit.interruptAllAbilities(engine as EngineContext);
    }
    return true;
}
