import type { GameEngine } from '../GameEngine';
import type { KnockbackSource } from '../units/unitTypes';
import { ITS_ENDED_EARLY_PLAYAHEAD_MAX_TICKS } from '../gameConstants';

/**
 * The cast an interactive targeting preview is running (see `GameEngine.sequentialTargetingPreviewCast`).
 * Ephemeral: never serialized.
 */
export interface SequentialTargetingPreviewCast {
    unitId: string;
    abilityId: string;
    startRound: number;
    /** `engine.gameTime` when the preview began (set by ITS `begin()` / `replay()`). */
    beganAtGameTime: number;
    /**
     * Resume mode (a preview that starts at a missing-pick pause): `startTime` of the paused cast the
     * preview continues. Set by `beginResume`.
     */
    resumeCastStartTime?: number;
    /** Set once (first `cast_ended_early` event for this preview cast); the preview then plays forward to a stop point. */
    endedEarly?: { atTick: number; reason: 'interrupted' | 'fizzled'; source?: KnockbackSource };
}

/**
 * True when a cast instance (`castStartTime`) belongs to the preview cast. Unit and ability must
 * match, and the cast must have started inside this preview: either it is the resume cast (when
 * `resumeCastStartTime` is set) or it started at or after the preview began. This ignores a Combo
 * follow-up's same-id recast of the **previous** cast, which started before the preview.
 */
export function isPreviewCastInstance(
    previewCast: SequentialTargetingPreviewCast,
    unitId: string,
    abilityId: string,
    castStartTime: number,
): boolean {
    if (previewCast.unitId !== unitId || previewCast.abilityId !== abilityId) return false;
    if (previewCast.resumeCastStartTime != null && castStartTime === previewCast.resumeCastStartTime) {
        return true;
    }
    return castStartTime >= previewCast.beganAtGameTime;
}

/**
 * True while the preview cast order is queued but has not been applied yet (e.g. ITS began
 * at the mark tick while the batch order applies on the next tick). Lobby 1EFEAD: treating
 * "not yet started" as complete latched auto-commit and soft-locked the battle UI.
 */
function isPreviewCastOrderStillPending(
    engine: GameEngine,
    cast: { unitId: string; abilityId: string },
): boolean {
    return engine.state.orderMgr.pendingOrders.some(
        (entry) =>
            entry.order.unitId === cast.unitId
            && entry.order.abilityId === cast.abilityId
            && entry.gameTick >= engine.gameTick,
    );
}

/**
 * True when an interactive sequential targeting preview has finished playing and the
 * player may commit (Done pill). False while still collecting a target or when not in preview.
 *
 * Round advance alone does **not** complete the preview (lobby 10EA88): a cast mid-windup
 * can cross a round boundary while SelectTargetDef input is still ahead. Completion follows
 * caster death, cast leave-active, or conditional-cancel pause.
 */
export function isITSPreviewComplete(engine: GameEngine): boolean {
    if (!engine.isSequentialTargetingPreview || engine.sequentialTargetingPreviewCast == null) {
        return false;
    }
    if (engine.waitingForTargetInput != null) {
        return false;
    }

    const cast = engine.sequentialTargetingPreviewCast;
    const { unitId: casterId, abilityId: castAbilityId } = cast;
    const caster = engine.getUnit(casterId);
    if (!caster?.isAlive()) {
        return true;
    }

    // The cast ended early (interrupt / fizzle): keep playing forward and stop at the ended-early
    // stop point instead of the "cast left active" rule.
    if (cast.endedEarly != null) {
        return getEndedEarlyPreviewStop(engine) != null;
    }

    const abilityStillActive = caster.activeAbilities.some((a) => a.abilityId === castAbilityId);
    if (!abilityStillActive) {
        return !isPreviewCastOrderStillPending(engine, cast);
    }

    return isPreviewCastConditionalCancelPaused(engine);
}

/**
 * Whether a finished ITS preview commits automatically.
 * - **Ended early** (interrupt / fizzle / death; the picks it never reached are committed as
 *   `missingSelectLabels`): decided by the Undo rule, not Auto End. When Undo is not allowed there is
 *   nothing left to decide, so it commits; when Undo is allowed the player commits with Pass (or Done).
 * - **Otherwise:** Auto End commits only when every target was collected. An incomplete preview that did
 *   NOT end early must not auto-commit (lobbies 12D040 / 10EA88).
 */
export function shouldAutoCommitItsPreview(params: {
    previewComplete: boolean;
    allTargetsCollected: boolean;
    endedEarly: boolean;
    autoEndTurn: boolean;
    /** Whether Undo is currently allowed (`isItsUndoDisabled` is false). */
    undoAllowed: boolean;
}): boolean {
    if (!params.previewComplete) return false;
    if (params.endedEarly) return !params.undoAllowed;
    return params.autoEndTurn && params.allTargetsCollected;
}

/**
 * True when `unitId` has a cast paused at a missing-pick pause (`awaitingPickLabel` set): the owner
 * must pick, or Pass (the cast fizzles). Reads only the serialized cast marker.
 */
export function isAtMissingPickDecision(
    engine: Pick<GameEngine, 'getUnit'>,
    unitId: string | null | undefined,
): boolean {
    if (!unitId) return false;
    const unit = engine.getUnit(unitId);
    return unit?.activeAbilities.some((a) => a.awaitingPickLabel !== undefined) ?? false;
}

/** Why an ended-early preview stopped playing forward (see {@link getEndedEarlyPreviewStop}). */
export type EndedEarlyPreviewStop = 'caster_died' | 'caster_ready' | 'parallel_pause' | 'cap';

/**
 * Stop point for a preview whose cast ended early. Null while the preview should keep playing (or
 * when the preview cast has not ended early). Checked in order:
 * - caster dead
 * - a non-host freeze on a local parallel pause (`engine.waitingForOrders` set during the preview)
 * - the caster can act again (`orderMgr.shouldPauseForOrders`, the predicate that forms the real
 *   order pause, so the preview stops where natural completion would)
 * - the playahead reached {@link ITS_ENDED_EARLY_PLAYAHEAD_MAX_TICKS} ticks after the early end
 */
export function getEndedEarlyPreviewStop(engine: GameEngine): EndedEarlyPreviewStop | null {
    const cast = engine.sequentialTargetingPreviewCast;
    const endedEarly = cast?.endedEarly;
    if (!cast || !endedEarly) return null;
    const caster = engine.getUnit(cast.unitId);
    if (!caster?.isAlive()) return 'caster_died';
    if (engine.waitingForOrders != null) return 'parallel_pause';
    if (engine.state.orderMgr.shouldPauseForOrders(caster)) return 'caster_ready';
    if (engine.gameTick - endedEarly.atTick >= ITS_ENDED_EARLY_PLAYAHEAD_MAX_TICKS) return 'cap';
    return null;
}

/**
 * True when the ITS preview cast is paused on a conditional-cancel decision (e.g. Entombed).
 * A Combo follow-up preview of the same ability starts on the previous cast's pause; that
 * paused cast is not the preview cast until the queued preview order applies and cancels it.
 */
export function isPreviewCastConditionalCancelPaused(engine: GameEngine): boolean {
    const cast = engine.sequentialTargetingPreviewCast;
    if (!cast) return false;
    if (isPreviewCastOrderStillPending(engine, cast)) return false;
    const caster = engine.getUnit(cast.unitId);
    return isCasterInConditionalCancelPause(caster, cast.abilityId);
}

/**
 * True when the local order UI is at a Combo / Entombed decision point for `unitId`.
 * While ITS is active only the preview cast's own pause counts: a follow-up preview begins
 * on the previous cast's pause, which stays flagged until the preview order applies.
 */
export function isAtConditionalCancelDecision(
    engine: GameEngine,
    unitId: string | null | undefined,
    its: { isActive: boolean; previewOrderQueued: boolean },
): boolean {
    if (its.isActive) {
        return its.previewOrderQueued && isPreviewCastConditionalCancelPaused(engine);
    }
    return isCasterInConditionalCancelPause(unitId ? engine.getUnit(unitId) : undefined);
}

/** True when a unit is mid conditional-cancel and awaiting a follow-up or wait. */
export function isCasterInConditionalCancelPause(
    caster: { activeAbilities: ReadonlyArray<{ abilityId: string; conditionalCancelPaused?: boolean }> } | null | undefined,
    abilityId?: string,
): boolean {
    return caster?.activeAbilities.some(
        (a) => a.conditionalCancelPaused && (abilityId == null || a.abilityId === abilityId),
    ) ?? false;
}
