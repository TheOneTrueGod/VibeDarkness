import { StaggeredBuff, STAGGERED_BUFF_TYPE } from '../buffs/StaggeredBuff';
import type { Unit } from '../game/units/Unit';
import type { EventBus } from '../game/EventBus';
import { hasUnitTag, UnitTag } from '../game/units/unitTag';
import { STAGGER_MIN_POTENCY_SEC } from './ccConstants';
import { applyCcThroughArmourGate } from './hardCcGate';
import type { KnockbackEngineCtx } from './knockbackKeywords';

export type StaggerAttemptOutcome = 'no_potency' | 'absorbed' | 'applied';

export type StaggerAttemptResult =
    | { outcome: 'no_potency' }
    | { outcome: 'absorbed' }
    | { outcome: 'applied'; effectiveDuration: number };

/** Armour charges Stagger spends: weak CC, never consumes or breaks armour. */
export const STAGGER_ARMOUR_CHARGES = 0;

/**
 * Apply Stagger (a weak stun) through the shared CC armour gate with a weak charge of 0.
 *
 * - Armoured target (`getEffectiveHardCcThreshold > 0`): absorbed, armour untouched, no Exposed.
 * - Exposed target: duration is added to Exposed via `ExposedBuff.extendDuration`
 *   (`boss_exposed_cc_suppressed` is emitted); no Staggered buff.
 * - iFrames (unless `engine.respectIFrames === false`) and juggernaut window: absorbed.
 * - Already stunned or lifted, and `UnitTag.Structure`: absorbed (no-op).
 * - Existing Stagger: replaced only when the new duration is longer (never extended or stacked).
 * - Landing does not count toward hard-CC chain stacking.
 * - On apply, active abilities are interrupted via `engine.interruptUnitAndRefundAbilities`.
 */
export function tryApplyStagger(
    target: Unit,
    baseSeconds: number,
    engine: KnockbackEngineCtx,
): StaggerAttemptResult {
    if (hasUnitTag(target, UnitTag.Structure)) return { outcome: 'absorbed' };
    if (target.hasBuff('stunned') || target.hasBuff('lifted')) return { outcome: 'absorbed' };

    return applyCcThroughArmourGate(target, {
        ccType: 'STAGGER',
        baseSeconds,
        gameTime: engine.gameTime,
        roundNumber: engine.roundNumber,
        eventBus: engine.eventBus as EventBus | undefined,
        armourCharges: STAGGER_ARMOUR_CHARGES,
        respectIFrames: engine.respectIFrames !== false,
        minPotencySec: STAGGER_MIN_POTENCY_SEC,
        buildBuff: (duration) => {
            const existing = target.buffs.find((b) => b._type === STAGGERED_BUFF_TYPE);
            if (existing) {
                const remaining = existing.duration.value - (engine.gameTime - existing.appliedAtTime);
                if (remaining >= duration) return null;
                target.buffs = target.buffs.filter((b) => b !== existing);
            }
            return new StaggeredBuff(duration);
        },
        onApplied: () => engine.interruptUnitAndRefundAbilities?.(target),
    });
}
