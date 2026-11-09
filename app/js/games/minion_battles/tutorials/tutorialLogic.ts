/** Pure tutorial rules: which tutorial to show, step advancing and progress. See `tutorialTypes.ts`. */
import { readTutorialProgress, type AccountKnowledgeMap, type TutorialProgress } from '../../../accountKnowledge';
import {
    DEFAULT_BATTLE_START_WINDOW_SECONDS,
    type TutorialDef,
    type TutorialEvent,
    type TutorialStepDef,
    type TutorialTextTerm,
    type TutorialUnitFilter,
} from './tutorialTypes';
import { ABILITY_TIMING_TAG_COLORS } from '../abilities/abilityTimings';

/** What tutorial rules need to know about one living unit. */
export interface TutorialUnitView {
    characterId: string;
    stackSize: number;
    /** Hostile to the local player. */
    hostile: boolean;
    /** Its juggernaut border is showing (it is inside a juggernaut window). */
    inJuggernautWindow: boolean;
}

/** Where a battle is when tutorials are checked. */
export interface TutorialBattleContext {
    missionId: string;
    /** Battle clock, seconds. */
    gameTimeSeconds: number;
    /** Living units currently on screen (for `unitOnScreen` triggers). */
    unitsOnScreen?: readonly TutorialUnitView[];
}

export interface ActiveTutorial {
    def: TutorialDef;
    step: number;
}

/** Whether `unit` satisfies every field of `filter`. */
export function unitMatchesTutorialFilter(unit: TutorialUnitView, filter: TutorialUnitFilter): boolean {
    if (filter.characterId != null && unit.characterId !== filter.characterId) return false;
    if (filter.minStackSize != null && unit.stackSize < filter.minStackSize) return false;
    if (filter.hostile != null && unit.hostile !== filter.hostile) return false;
    if (filter.inJuggernautWindow != null && unit.inJuggernautWindow !== filter.inJuggernautWindow) return false;
    return true;
}

function triggerMatches(def: TutorialDef, ctx: TutorialBattleContext): boolean {
    const trigger = def.trigger;
    switch (trigger.type) {
        case 'battleStart':
            return (
                trigger.missionId === ctx.missionId &&
                ctx.gameTimeSeconds <= (trigger.withinSeconds ?? DEFAULT_BATTLE_START_WINDOW_SECONDS)
            );
        case 'unitOnScreen':
            return (ctx.unitsOnScreen ?? []).some((u) => unitMatchesTutorialFilter(u, trigger.unit));
    }
}

/**
 * Fill a step's text tokens from the unit it points at (see `TutorialStepDef.text`). With no unit (it died,
 * or the step points at none), `{stackSize}` reads "several".
 */
export function formatTutorialStepText(text: string, unit: TutorialUnitView | null | undefined): string {
    return text.replace(/\{stackSize\}/g, unit ? String(unit.stackSize) : 'several');
}

/** Colour of each `{Term}` word usable in step text. */
export const TUTORIAL_TEXT_TERM_COLORS: Readonly<Record<TutorialTextTerm, string>> = {
    Juggernaut: ABILITY_TIMING_TAG_COLORS.juggernaut,
};

/** A run of step text: plain, or a coloured term. */
export interface TutorialTextSegment {
    text: string;
    color?: string;
}

/** Split already-formatted step text into plain and coloured-term runs (`{Juggernaut}` becomes a coloured word). */
export function tutorialTextSegments(text: string): TutorialTextSegment[] {
    const segments: TutorialTextSegment[] = [];
    let last = 0;
    for (const match of text.matchAll(/\{(\w+)\}/g)) {
        const color = (TUTORIAL_TEXT_TERM_COLORS as Record<string, string | undefined>)[match[1]];
        if (!color) continue;
        if (match.index > last) segments.push({ text: text.slice(last, match.index) });
        segments.push({ text: match[1], color });
        last = match.index + match[0].length;
    }
    if (last < text.length) segments.push({ text: text.slice(last) });
    return segments;
}

/**
 * The first tutorial in `tutorials` whose trigger matches and that the player has not finished, resumed
 * at its stored step. Null when none applies.
 */
export function findTriggeredTutorial(
    tutorials: readonly TutorialDef[],
    knowledge: AccountKnowledgeMap,
    ctx: TutorialBattleContext,
    /** Tutorial ids to pass over (e.g. already shown in this battle while the account reloads). */
    exclude?: ReadonlySet<string>,
    /** Restrict to tutorials passing this test (e.g. only `pauseGame` ones when it is not the player's turn). */
    accept?: (def: TutorialDef) => boolean,
): ActiveTutorial | null {
    for (const def of tutorials) {
        if (exclude?.has(def.id)) continue;
        if (accept && !accept(def)) continue;
        if (def.steps.length === 0 || !triggerMatches(def, ctx)) continue;
        const progress = readTutorialProgress(knowledge, def.knowledgeKey, def.id);
        if (progress?.done) continue;
        return { def, step: Math.min(progress?.step ?? 0, def.steps.length - 1) };
    }
    return null;
}

/** Whether `event` completes `step` (steps that wait on a button never advance from events). */
export function stepAdvancedBy(step: TutorialStepDef, event: TutorialEvent): boolean {
    const advance = step.advance;
    if (advance.type !== 'localOrder' || event.type !== 'localOrder') return false;
    if (advance.withMove && !event.hasMove) return false;
    if (advance.abilityIds && !advance.abilityIds.includes(event.abilityId)) return false;
    return true;
}

/** Progress after finishing `step`: the next step, or done after the last one. */
export function progressAfterStep(def: TutorialDef, step: number): TutorialProgress {
    const next = step + 1;
    return next >= def.steps.length ? { step, done: true } : { step: next, done: false };
}

/** Button label for a `next` step. */
export function nextButtonLabel(def: TutorialDef, step: number): string | null {
    const advance = def.steps[step]?.advance;
    if (advance?.type !== 'next') return null;
    return advance.label ?? (step >= def.steps.length - 1 ? 'Got it' : 'Next');
}
