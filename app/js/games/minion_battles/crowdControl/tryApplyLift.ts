import { LiftedBuff } from '../buffs/LiftedBuff';
import { ExposedBuff, EXPOSED_BUFF_TYPE } from '../buffs/ExposedBuff';
import type { Unit } from '../game/units/Unit';
import type { KnockbackSource } from '../game/units/unitTypes';
import type { EventBus } from '../game/EventBus';
import { CC_MIN_POTENCY_SEC } from './ccConstants';
import { resolveCcDuration } from './resolveCcDuration';
import { getEffectiveHardCcThreshold, onSuccessfulHardCcLand, recordHardCcArmourEvent } from './ccArmourState';
import type { KnockbackEngineCtx } from './knockbackKeywords';
import type { LiftSlamParams } from '../buffs/LiftedBuff';

export type LiftAttemptOutcome = 'no_potency' | 'absorbed' | 'applied';

export type LiftAttemptResult =
    | { outcome: 'no_potency' }
    | { outcome: 'absorbed' }
    | { outcome: 'applied' };

/**
 * Apply a lift hard CC with duration resist and hard CC armour gate + chain stacking.
 * Mirrors {@link tryApplyHardCcStun} gating; on success the target is suspended until expiry
 * then slammed via {@link LiftedBuff.onBeforeExpire}.
 */
export function tryApplyLift(
    target: Unit,
    durationSeconds: number,
    slamParams: LiftSlamParams,
    source: KnockbackSource,
    engine: KnockbackEngineCtx,
    ccCharges = 1,
): LiftAttemptResult {
    if (target.isInJuggernautWindow(engine.gameTime)) {
        return { outcome: 'absorbed' };
    }

    if (target.hasBuff('exposed')) {
        const exposedBuff = target.buffs.find((b) => b._type === EXPOSED_BUFF_TYPE) as ExposedBuff | undefined;
        exposedBuff?.extendDuration(durationSeconds, engine.gameTime);
        (engine.eventBus as EventBus)?.emit('boss_exposed_cc_suppressed', { unitId: target.id });
        return { outcome: 'absorbed' };
    }

    const effectiveDuration = resolveCcDuration(target, 'STUN', durationSeconds);
    if (effectiveDuration < CC_MIN_POTENCY_SEC) {
        return { outcome: 'no_potency' };
    }

    const threshold = getEffectiveHardCcThreshold(target);
    if (threshold <= 0) {
        target.addBuff(
            new LiftedBuff(effectiveDuration, slamParams, source.unitId),
            engine.gameTime,
            engine.roundNumber,
        );
        onSuccessfulHardCcLand(target);
        recordHardCcArmourEvent(target, 'landed', engine.gameTime);
        engine.interruptUnitAndRefundAbilities?.(target);
        return { outcome: 'applied' };
    }

    if (target.ccArmour.hardConsumed + ccCharges <= threshold) {
        target.ccArmour.hardConsumed += ccCharges;
        recordHardCcArmourEvent(target, 'absorbed', engine.gameTime);
        return { outcome: 'absorbed' };
    }

    // Armour breaks: apply Exposed instead of lift (same as stun path).
    target.ccArmour.hardConsumed = 0;
    const breakDuration =
        target.ccArmour.breakStunDuration > 0 ? target.ccArmour.breakStunDuration : effectiveDuration;
    target.addBuff(new ExposedBuff(breakDuration), engine.gameTime, engine.roundNumber);
    onSuccessfulHardCcLand(target);
    recordHardCcArmourEvent(target, 'landed', engine.gameTime);
    engine.interruptUnitAndRefundAbilities?.(target);
    return { outcome: 'applied' };
}
