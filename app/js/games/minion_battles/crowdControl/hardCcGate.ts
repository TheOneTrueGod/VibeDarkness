import { ExposedBuff, EXPOSED_BUFF_TYPE } from '../buffs/ExposedBuff';
import type { Buff } from '../buffs/Buff';
import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';
import { CC_MIN_POTENCY_SEC } from './ccConstants';
import { resolveCcDuration } from './resolveCcDuration';
import type { CcType } from './ccTypes';
import { getEffectiveHardCcThreshold, onSuccessfulHardCcLand, recordHardCcArmourEvent } from './ccArmourState';

export type HardCcStunAttemptOutcome = 'no_potency' | 'absorbed' | 'applied';

export type HardCcStunAttemptResult =
    | { outcome: 'no_potency' }
    | { outcome: 'absorbed' }
    | { outcome: 'applied'; effectiveDuration: number };

export interface CcArmourGateOptions {
    /** Resist key used for {@link resolveCcDuration}. */
    ccType: CcType;
    baseSeconds: number;
    gameTime: number;
    roundNumber: number;
    eventBus?: EventBus;
    /**
     * Armour charges this attempt spends. `>= 1` is a normal hard CC (consume / break armour,
     * stack chain bonus). `0` is a weak CC: armoured targets absorb it without spending armour,
     * and a landing does not count toward hard-CC chain stacking.
     */
    armourCharges: number;
    respectIFrames: boolean;
    /** Resolved durations below this do nothing (default {@link CC_MIN_POTENCY_SEC}). */
    minPotencySec?: number;
    /**
     * Build the buff to apply to an unarmoured target. Return `null` to apply nothing
     * (reported as `absorbed`), e.g. when an existing buff already outlasts the new one.
     */
    buildBuff(effectiveDuration: number): Buff | null;
    /** Called after the debuff (or the armour-break Exposed) lands. */
    onApplied?(): void;
}

/**
 * Shared hard-CC gate: juggernaut, iFrames, Exposed (extend + absorb), duration resist and
 * potency, then armour (absorb / break into Exposed / land). Used by stun and Stagger.
 */
export function applyCcThroughArmourGate(target: Unit, o: CcArmourGateOptions): HardCcStunAttemptResult {
    const weak = o.armourCharges <= 0;

    // Units in a juggernaut window are immune to CC interruption: no armour consumed, no CC.
    if (target.isInJuggernautWindow(o.gameTime)) {
        return { outcome: 'absorbed' };
    }

    if (o.respectIFrames && target.hasIFrames(o.gameTime)) {
        return { outcome: 'absorbed' };
    }

    // Exposed units are immune to further hard CC; absorbed CC may extend the exposed window.
    if (target.hasBuff('exposed')) {
        const exposedBuff = target.buffs.find((b) => b._type === EXPOSED_BUFF_TYPE) as ExposedBuff | undefined;
        exposedBuff?.extendDuration(o.baseSeconds, o.gameTime);
        o.eventBus?.emit('boss_exposed_cc_suppressed', { unitId: target.id });
        return { outcome: 'absorbed' };
    }

    const effectiveDuration = resolveCcDuration(target, o.ccType, o.baseSeconds);
    if (effectiveDuration < (o.minPotencySec ?? CC_MIN_POTENCY_SEC)) {
        return { outcome: 'no_potency' };
    }

    const threshold = getEffectiveHardCcThreshold(target);
    if (threshold <= 0) {
        const buff = o.buildBuff(effectiveDuration);
        if (!buff) return { outcome: 'absorbed' };
        target.addBuff(buff, o.gameTime, o.roundNumber);
        if (!weak) {
            onSuccessfulHardCcLand(target);
            recordHardCcArmourEvent(target, 'landed', o.gameTime);
        }
        o.onApplied?.();
        return { outcome: 'applied', effectiveDuration };
    }

    // Weak CC against armour: shrugged off, armour untouched, no HUD armour event.
    if (weak) {
        return { outcome: 'absorbed' };
    }

    if (target.ccArmour.hardConsumed + o.armourCharges <= threshold) {
        target.ccArmour.hardConsumed += o.armourCharges;
        recordHardCcArmourEvent(target, 'absorbed', o.gameTime);
        return { outcome: 'absorbed' };
    }

    // Armour breaks: apply Exposed instead of the plain debuff.
    target.ccArmour.hardConsumed = 0;
    const breakDuration = target.ccArmour.breakStunDuration > 0 ? target.ccArmour.breakStunDuration : effectiveDuration;
    target.addBuff(new ExposedBuff(breakDuration), o.gameTime, o.roundNumber);
    onSuccessfulHardCcLand(target);
    recordHardCcArmourEvent(target, 'landed', o.gameTime);
    o.onApplied?.();
    return { outcome: 'applied', effectiveDuration: breakDuration };
}
