import { StunnedBuff } from '../buffs/StunnedBuff';
import type { Unit } from '../game/units/Unit';
import { CC_MIN_POTENCY_SEC } from './ccConstants';
import { resolveCcDuration } from './resolveCcDuration';

export type HardCcStunAttemptOutcome = 'no_potency' | 'absorbed' | 'applied';

export type HardCcStunAttemptResult =
    | { outcome: 'no_potency' }
    | { outcome: 'absorbed' }
    | { outcome: 'applied'; effectiveDuration: number };

/**
 * Apply a STUN hard CC with duration resist and hard CC armour gate + chain stacking.
 */
export function tryApplyHardCcStun(
    target: Unit,
    baseSeconds: number,
    gameTime: number,
    roundNumber: number,
): HardCcStunAttemptResult {
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

    if (target.hardCcArmourConsumed < threshold) {
        target.hardCcArmourConsumed += 1;
        target.recordHardCcArmourEvent('absorbed', gameTime);
        return { outcome: 'absorbed' };
    }

    target.hardCcArmourConsumed = 0;
    const breakDuration = target.ccArmourBreakStunDuration > 0 ? target.ccArmourBreakStunDuration : effectiveDuration;
    target.addBuff(new StunnedBuff(breakDuration), gameTime, roundNumber);
    target.onSuccessfulHardCcLand();
    target.recordHardCcArmourEvent('landed', gameTime);
    return { outcome: 'applied', effectiveDuration: breakDuration };
}
