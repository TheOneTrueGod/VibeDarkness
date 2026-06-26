import { StunnedBuff } from '../buffs/StunnedBuff';
import { ExposedBuff, EXPOSED_BUFF_TYPE } from '../buffs/ExposedBuff';
import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';
import { CC_MIN_POTENCY_SEC } from './ccConstants';
import { resolveCcDuration } from './resolveCcDuration';

export type HardCcStunAttemptOutcome = 'no_potency' | 'absorbed' | 'applied';

export type HardCcStunAttemptResult =
    | { outcome: 'no_potency' }
    | { outcome: 'absorbed' }
    | { outcome: 'applied'; effectiveDuration: number };

/**
 * Apply a STUN hard CC with duration resist and hard CC armour gate + chain stacking.
 * Pass eventBus to emit a 'boss_exposed_cc_suppressed' event when CC is absorbed by an Exposed unit.
 */
export function tryApplyHardCcStun(
    target: Unit,
    baseSeconds: number,
    gameTime: number,
    roundNumber: number,
    eventBus?: EventBus,
    ccCharges = 1,
): HardCcStunAttemptResult {
    // Units in a juggernaut window are immune to CC interruption — no armour consumed, no stun.
    if (target.isInJuggernautWindow(gameTime)) {
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

    const threshold = target.getEffectiveHardCcThreshold();
    if (threshold <= 0) {
        target.addBuff(new StunnedBuff(effectiveDuration), gameTime, roundNumber);
        target.onSuccessfulHardCcLand();
        target.recordHardCcArmourEvent('landed', gameTime);
        return { outcome: 'applied', effectiveDuration };
    }

    if (target.hardCcArmourConsumed + ccCharges <= threshold) {
        target.hardCcArmourConsumed += ccCharges;
        target.recordHardCcArmourEvent('absorbed', gameTime);
        return { outcome: 'absorbed' };
    }

    // Armour breaks: apply Exposed instead of a plain stun.
    target.hardCcArmourConsumed = 0;
    const breakDuration = target.ccArmourBreakStunDuration > 0 ? target.ccArmourBreakStunDuration : effectiveDuration;
    target.addBuff(new ExposedBuff(breakDuration), gameTime, roundNumber);
    target.onSuccessfulHardCcLand();
    target.recordHardCcArmourEvent('landed', gameTime);
    return { outcome: 'applied', effectiveDuration: breakDuration };
}
