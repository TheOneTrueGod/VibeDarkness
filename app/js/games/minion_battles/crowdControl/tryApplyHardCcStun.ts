import { StunnedBuff } from '../buffs/StunnedBuff';
import { ExposedBuff, EXPOSED_BUFF_TYPE } from '../buffs/ExposedBuff';
import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';
import { CC_MIN_POTENCY_SEC } from './ccConstants';
import { resolveCcDuration } from './resolveCcDuration';
import { getEffectiveHardCcThreshold, onSuccessfulHardCcLand, recordHardCcArmourEvent } from './ccArmourState';

export type HardCcStunAttemptOutcome = 'no_potency' | 'absorbed' | 'applied';

export type HardCcStunAttemptResult =
    | { outcome: 'no_potency' }
    | { outcome: 'absorbed' }
    | { outcome: 'applied'; effectiveDuration: number };

/**
 * Apply a STUN hard CC with duration resist and hard CC armour gate + chain stacking.
 * Pass eventBus to emit a 'boss_exposed_cc_suppressed' event when CC is absorbed by an Exposed unit.
 * Active iFrames (when `respectIFrames` is not false) no-op like juggernaut — no stun, no armour.
 */
export function tryApplyHardCcStun(
    target: Unit,
    baseSeconds: number,
    gameTime: number,
    roundNumber: number,
    eventBus?: EventBus,
    ccCharges = 1,
    respectIFrames = true,
): HardCcStunAttemptResult {
    // Units in a juggernaut window are immune to CC interruption — no armour consumed, no stun.
    if (target.isInJuggernautWindow(gameTime)) {
        return { outcome: 'absorbed' };
    }

    if (respectIFrames && target.hasIFrames(gameTime)) {
        return { outcome: 'absorbed' };
    }

    // Exposed units are immune to further hard CC; absorbed CC may extend the exposed window.
    if (target.hasBuff('exposed')) {
        const exposedBuff = target.buffs.find(b => b._type === EXPOSED_BUFF_TYPE) as ExposedBuff | undefined;
        exposedBuff?.extendDuration(baseSeconds, gameTime);
        eventBus?.emit('boss_exposed_cc_suppressed', { unitId: target.id });
        return { outcome: 'absorbed' };
    }

    const effectiveDuration = resolveCcDuration(target, 'STUN', baseSeconds);
    if (effectiveDuration < CC_MIN_POTENCY_SEC) {
        return { outcome: 'no_potency' };
    }

    const threshold = getEffectiveHardCcThreshold(target);
    if (threshold <= 0) {
        target.addBuff(new StunnedBuff(effectiveDuration), gameTime, roundNumber);
        onSuccessfulHardCcLand(target);
        recordHardCcArmourEvent(target, 'landed', gameTime);
        return { outcome: 'applied', effectiveDuration };
    }

    if (target.ccArmour.hardConsumed + ccCharges <= threshold) {
        target.ccArmour.hardConsumed += ccCharges;
        recordHardCcArmourEvent(target, 'absorbed', gameTime);
        return { outcome: 'absorbed' };
    }

    // Armour breaks: apply Exposed instead of a plain stun.
    target.ccArmour.hardConsumed = 0;
    const breakDuration = target.ccArmour.breakStunDuration > 0 ? target.ccArmour.breakStunDuration : effectiveDuration;
    target.addBuff(new ExposedBuff(breakDuration), gameTime, roundNumber);
    onSuccessfulHardCcLand(target);
    recordHardCcArmourEvent(target, 'landed', gameTime);
    return { outcome: 'applied', effectiveDuration: breakDuration };
}
