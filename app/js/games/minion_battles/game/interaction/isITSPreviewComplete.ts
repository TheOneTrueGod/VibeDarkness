import type { GameEngine } from '../GameEngine';

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

    const abilityStillActive = caster.activeAbilities.some((a) => a.abilityId === castAbilityId);
    if (!abilityStillActive) {
        return !isPreviewCastOrderStillPending(engine, cast);
    }

    const conditionalCancelActive = caster.activeAbilities.some(
        (a) => a.abilityId === castAbilityId && a.conditionalCancelPaused,
    );
    if (conditionalCancelActive) {
        return true;
    }

    return false;
}

/** True when the ITS preview cast is paused on a conditional-cancel decision (e.g. Entombed). */
export function isPreviewCastConditionalCancelPaused(engine: GameEngine): boolean {
    const cast = engine.sequentialTargetingPreviewCast;
    if (!cast) return false;
    const caster = engine.getUnit(cast.unitId);
    return isCasterInConditionalCancelPause(caster, cast.abilityId);
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
