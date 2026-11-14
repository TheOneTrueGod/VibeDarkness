/** ITS preview phase mirrored from the battle UI poll. */
export type ItsHandPreviewPhase = 'inactive' | 'playing' | 'paused' | 'done';

export interface AbilityHandCardFlagsInput {
    handIndex: number;
    selectedCardIndex: number | null;
    specialActionAbilityId: string | null;
    /** Ability currently shown on the card (mode-resolved). */
    cardAbilityId: string;
    /** Slot ability id before a mode swap. */
    slotAbilityId: string;
    /** First hand index whose shown ability is executing, or -1. */
    activeHandIndex: number;
    isMyTurn: boolean;
    itsPreviewPhase: ItsHandPreviewPhase;
    /** Local ITS cast ability while a preview run is active. */
    itsAbilityId: string | null;
    /**
     * Engine is sitting on a parallel-order pause (`waitingForOrders`) while the preview poll
     * still says `playing` (non-host freeze). Treated as a pause plane.
     */
    atParallelPause?: boolean;
}

/**
 * Card chrome for the ability hand.
 * During ITS playahead (`playing`, and not frozen on a parallel-order pause) the cast's card is
 * the green in-use highlight, ahead of the yellow selection border. At a pause plane (`paused`,
 * `done`, or a parallel-order freeze) that card drops the in-use green and uses the ordinary
 * selected / idle border.
 */
export function abilityHandCardFlags(
    input: AbilityHandCardFlagsInput,
): { isSelected: boolean; isActive: boolean } {
    const isItsAbility =
        input.itsAbilityId != null
        && (input.cardAbilityId === input.itsAbilityId || input.slotAbilityId === input.itsAbilityId);
    const frozenOnParallelPause = input.atParallelPause === true;
    const playaheadGreen = isItsAbility && input.itsPreviewPhase === 'playing' && !frozenOnParallelPause;
    const atPausePlane =
        isItsAbility
        && (
            input.itsPreviewPhase === 'paused'
            || input.itsPreviewPhase === 'done'
            || (input.itsPreviewPhase === 'playing' && frozenOnParallelPause)
        );
    const isSelected =
        !playaheadGreen
        && (
            input.selectedCardIndex === input.handIndex
            || (input.specialActionAbilityId != null && input.cardAbilityId === input.specialActionAbilityId)
        );
    const executing =
        input.activeHandIndex >= 0 && input.handIndex === input.activeHandIndex && !input.isMyTurn;
    const isActive = playaheadGreen || (executing && !atPausePlane);
    return { isSelected, isActive };
}
