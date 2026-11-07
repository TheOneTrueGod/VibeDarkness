/**
 * Tutorial definitions: short guided step sequences shown to one player in a battle.
 *
 * A tutorial belongs to an account knowledge key (`knowledgeKey`); one key may carry zero, one or many
 * tutorials. Progress is stored on that knowledge entry (`knowledge[key].tutorials[id]`), so which
 * tutorial to show, and from which step, comes from the player's own account. Tutorials are UI only:
 * they never touch the simulation, and each player sees their own.
 */
import type { HudAnchorId } from '../ui/components/hudAnchors';

/**
 * Which units a trigger or pointer means. Every field given must hold; an empty filter matches any
 * living unit.
 */
export interface TutorialUnitFilter {
    characterId?: string;
    /** Only unit stacks of at least this many members (`Unit.stackSize`). */
    minStackSize?: number;
    /** Only units hostile to the local player. */
    hostile?: boolean;
}

/** When a tutorial starts. */
export type TutorialTrigger =
    | {
          /** At the start of a battle in `missionId`, on the local player's first turn. */
          type: 'battleStart';
          missionId: string;
          /** Only while the battle clock is under this many seconds (default {@link DEFAULT_BATTLE_START_WINDOW_SECONDS}). */
          withinSeconds?: number;
      }
    | {
          /**
           * On any of the local player's turns (in any mission) while a living unit matching `unit` is on
           * screen. Use it to explain a unit or mechanic the first time the player meets it.
           */
          type: 'unitOnScreen';
          unit: TutorialUnitFilter;
      };

export const DEFAULT_BATTLE_START_WINDOW_SECONDS = 1;

/** Something on screen a step points at. Targets that are missing just show no pointer. */
export type TutorialPointerTarget =
    /** The living unit matching the filter nearest the local player's unit. */
    | ({ type: 'unit' } & TutorialUnitFilter)
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
    /**
     * Step text. Tokens filled from the unit the step points at: `{stackSize}` — that unit's stack count
     * ("several" when there is no such unit).
     */
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
