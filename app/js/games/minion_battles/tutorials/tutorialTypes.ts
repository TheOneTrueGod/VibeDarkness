/**
 * Tutorial definitions: short guided step sequences shown to one player in a battle.
 *
 * A tutorial belongs to an account knowledge key (`knowledgeKey`); one key may carry zero, one or many
 * tutorials. Progress is stored on that knowledge entry (`knowledge[key].tutorials[id]`), so which
 * tutorial to show, and from which step, comes from the player's own account. Tutorials are UI only:
 * they never touch the simulation, and each player sees their own.
 */
import type { HudAnchorId } from '../ui/components/hudAnchors';

/** When a tutorial starts. */
export type TutorialTrigger = {
    /** At the start of a battle in `missionId`, on the local player's first turn. */
    type: 'battleStart';
    missionId: string;
    /** Only while the battle clock is under this many seconds (default {@link DEFAULT_BATTLE_START_WINDOW_SECONDS}). */
    withinSeconds?: number;
};

export const DEFAULT_BATTLE_START_WINDOW_SECONDS = 1;

/** Something on screen a step points at. Targets that are missing just show no pointer. */
export type TutorialPointerTarget =
    /** The living unit with this `characterId` nearest the local player's unit. */
    | { type: 'unit'; characterId: string }
    /** The special tile with this `defId` nearest the local player's unit. */
    | { type: 'specialTile'; defId: string }
    /** The first of these abilities that is in the local player's hand. */
    | { type: 'abilityCard'; abilityIds: readonly string[] }
    /** Any registered DOM HUD anchor. */
    | { type: 'hudAnchor'; anchorId: HudAnchorId };

/** What moves a step on to the next one. */
export type TutorialAdvance =
    /** The player clicks a button (`label`, default "Next" / "Got it" on the last step). */
    | { type: 'next'; label?: string }
    /**
     * The local player submits an order. `withMove`: it must carry a movement target. `abilityIds`: its
     * primary ability must be one of these. Both given: both must hold.
     */
    | { type: 'localOrder'; withMove?: boolean; abilityIds?: readonly string[] };

export interface TutorialStepDef {
    text: string;
    pointAt?: TutorialPointerTarget;
    advance: TutorialAdvance;
}

export interface TutorialDef {
    /** Unique across all tutorials; the key its progress is stored under. */
    id: string;
    /** Account knowledge that carries this tutorial's progress (a `tutorial`-type key in `accountKnowledge.ts`). */
    knowledgeKey: string;
    /** Short heading shown above the step text. */
    title: string;
    trigger: TutorialTrigger;
    steps: readonly TutorialStepDef[];
}

/** Player actions a tutorial step can wait on. */
export type TutorialEvent = {
    type: 'localOrder';
    /** Primary ability of the order (`wait` for a move-only order). */
    abilityId: string;
    hasMove: boolean;
};
