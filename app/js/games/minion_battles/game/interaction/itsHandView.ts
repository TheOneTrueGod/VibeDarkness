import type { AbilityStatic } from '../../abilities/Ability';
import { getUnaffordableResourceId } from '../../abilities/abilityAffordability';
import { canUseAbilityNow } from '../../abilities/abilityUses';
import { EventBus } from '../EventBus';
import type { GameEngine } from '../GameEngine';
import type { SerializedGameState } from '../types';
import { Unit } from '../units/Unit';
import { getConditionalCancelDecisionCast } from './isITSPreviewComplete';

/** The parts of the ITS session the rewind view reads. */
export interface ItsRewindViewSession {
    readonly isActive: boolean;
    readonly previewOrderQueued: boolean;
    readonly isResumeMode: boolean;
    readonly unitId?: string | null;
    readonly mark?: SerializedGameState | null;
}

/** One rebuilt caster per mark snapshot (a mark is never mutated; a new preview makes a new one). */
const markUnitCache = new WeakMap<SerializedGameState, Map<string, Unit>>();

/**
 * The unit as it is in the ITS mark snapshot, i.e. the state a rewind returns to. Built once per
 * mark on a throwaway event bus; read only, never added to an engine.
 */
export function getMarkUnitView(mark: SerializedGameState, unitId: string): Unit | null {
    let perMark = markUnitCache.get(mark);
    const cached = perMark?.get(unitId);
    if (cached) return cached;
    const data = mark.units.find((u) => u.id === unitId);
    if (!data) return null;
    const unit = Unit.fromJSON(structuredClone(data), new EventBus(), mark.gameTick);
    if (!perMark) {
        perMark = new Map();
        markUnitCache.set(mark, perMark);
    }
    perMark.set(unitId, unit);
    return unit;
}

/**
 * The caster at the rewind target when a card click would rewind an ITS preview first, else null.
 * The cards keep showing live state; this is only what uses and costs are judged against
 * ({@link getRewindUnusableCause}), since the click acts after the rewind.
 *
 * Null (the click acts on the live frame) with no preview, a preview stopped on a Combo / Entombed
 * decision, a reaction pause that froze the preview, and missing-pick resume (its mark is that pause).
 */
export function getRewindTargetUnit(
    engine: GameEngine,
    its: ItsRewindViewSession | null | undefined,
    liveUnit: Unit | null,
): Unit | null {
    if (!liveUnit || !its?.isActive || its.isResumeMode || its.mark == null) return null;
    if (its.unitId != null && its.unitId !== liveUnit.id) return null;
    if (liveUnit.reactionPending != null) return null;
    if (getConditionalCancelDecisionCast(engine, liveUnit.id, its) !== undefined) return null;
    return getMarkUnitView(its.mark, liveUnit.id);
}

export type RewindUnusableCause = { kind: 'uses' } | { kind: 'resource'; resourceId: string };

/**
 * Why the ability can't be cast by `unit` (the rewind target from {@link getRewindTargetUnit}), or null
 * when it can. Single rule for the card's `unusable_at_rewind` reason and the ITS swap check.
 */
export function getRewindUnusableCause(unit: Unit, ability: AbilityStatic): RewindUnusableCause | null {
    const resourceId = getUnaffordableResourceId(unit, ability);
    if (resourceId != null) return { kind: 'resource', resourceId };
    if (!canUseAbilityNow(unit, ability)) return { kind: 'uses' };
    return null;
}
