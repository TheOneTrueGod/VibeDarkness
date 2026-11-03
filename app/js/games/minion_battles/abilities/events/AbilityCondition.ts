import type { AbilityEventType } from '../Ability';

/**
 * Declarative condition variants for ability event rules.
 * All conditions in a rule must pass for the rule to trigger (AND semantics).
 */
export type AbilityCondition =
    | { type: 'always' }
    | { type: 'elapsedTimeAtLeast'; seconds: number }
    | { type: 'elapsedTimeAtMost'; seconds: number }
    | { type: 'targetCountAtLeast'; count: number }
    | { type: 'casterHealthAtMostPercent'; percent: number }
    | { type: 'eventTypeIs'; eventType: AbilityEventType }
    | { type: 'hitResultIs'; result: 'hit' | 'blocked' }
    | { type: 'casterHasResearchNode'; treeId: string; nodeId: string }
    | { type: 'primaryTargetHasBuff'; buffType: string }
    /**
     * True when the rule identified by `ruleId` has triggered at least `count` times this cast.
     * The referenced rule MUST appear BEFORE this rule in declaration order (or have higher `priority`),
     * because the dispatcher increments counts within the same dispatch loop.
     * In dev mode the dispatcher warns if the ordering contract is violated.
     */
    | { type: 'selfRuleHasTriggeredAtLeast'; ruleId: string; count: number }
    /**
     * Passes while this rule has fired fewer than `count` times in its trigger scope: the active
     * cast for cast events, or the source buff for buff-owned events (e.g. a `ShieldBuff`'s
     * ON_BLOCK_SUCCESS). The dispatcher folds it into the rule's trigger cap; lowest count wins.
     */
    | { type: 'maxTriggers'; count: number }
    | AbilityCustomCondition;

/**
 * Escape hatch for conditions that need bespoke runtime logic.
 * `comment` is required so intent is clear in data-first ability definitions.
 */
export interface AbilityCustomCondition {
    type: 'custom';
    conditionId: string;
    comment: string;
    params?: Record<string, unknown>;
}
