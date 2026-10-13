import { StunnedBuff } from '../buffs/StunnedBuff';
import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';
import {
    applyCcThroughArmourGate,
    type HardCcStunAttemptOutcome,
    type HardCcStunAttemptResult,
} from './hardCcGate';

export type { HardCcStunAttemptOutcome, HardCcStunAttemptResult };

/**
 * Apply a STUN hard CC with duration resist and hard CC armour gate + chain stacking.
 * Pass eventBus to emit a 'boss_exposed_cc_suppressed' event when CC is absorbed by an Exposed unit.
 * Active iFrames (when `respectIFrames` is not false) no-op like juggernaut: no stun, no armour.
 * The gate itself lives in {@link applyCcThroughArmourGate} (shared with Stagger).
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
    return applyCcThroughArmourGate(target, {
        ccType: 'STUN',
        baseSeconds,
        gameTime,
        roundNumber,
        eventBus,
        armourCharges: ccCharges,
        respectIFrames,
        buildBuff: (d) => new StunnedBuff(d),
    });
}
