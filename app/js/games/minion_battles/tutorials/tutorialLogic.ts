/** Pure tutorial rules: which tutorial to show, step advancing and progress. See `tutorialTypes.ts`. */
import { readTutorialProgress, type AccountKnowledgeMap, type TutorialProgress } from '../../../accountKnowledge';
import {
    DEFAULT_BATTLE_START_WINDOW_SECONDS,
    type TutorialDef,
    type TutorialEvent,
    type TutorialStepDef,
} from './tutorialTypes';

/** Where a battle is when tutorials are checked. */
export interface TutorialBattleContext {
    missionId: string;
    /** Battle clock, seconds. */
    gameTimeSeconds: number;
}

export interface ActiveTutorial {
    def: TutorialDef;
    step: number;
}

function triggerMatches(def: TutorialDef, ctx: TutorialBattleContext): boolean {
    const trigger = def.trigger;
    switch (trigger.type) {
        case 'battleStart':
            return (
                trigger.missionId === ctx.missionId &&
                ctx.gameTimeSeconds <= (trigger.withinSeconds ?? DEFAULT_BATTLE_START_WINDOW_SECONDS)
            );
    }
}

/**
 * The first tutorial in `tutorials` whose trigger matches and that the player has not finished, resumed
 * at its stored step. Null when none applies.
 */
export function findTriggeredTutorial(
    tutorials: readonly TutorialDef[],
    knowledge: AccountKnowledgeMap,
    ctx: TutorialBattleContext,
): ActiveTutorial | null {
    for (const def of tutorials) {
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
