import type { GameEngine } from '../GameEngine';

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

    const { unitId: casterId, abilityId: castAbilityId } = engine.sequentialTargetingPreviewCast;
    const caster = engine.getUnit(casterId);
    if (!caster?.isAlive()) {
        return true;
    }

    const abilityStillActive = caster.activeAbilities.some((a) => a.abilityId === castAbilityId);
    if (!abilityStillActive) {
        return true;
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
    return caster?.activeAbilities.some(
        (a) => a.abilityId === cast.abilityId && a.conditionalCancelPaused,
    ) ?? false;
}
