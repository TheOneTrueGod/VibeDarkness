import type { AbilityCondition } from './AbilityCondition';
import type { AbilityEffect } from './AbilityEffect';
import type { AbilityEventRule } from './AbilityEventRule';

/**
 * Mutable per-cast counters for declarative ability-event rule execution.
 * Store this on the active cast payload in a later integration phase.
 */
export interface AbilityEventDispatchState {
    ruleTriggerCounts: Record<string, number>;
}

export interface AbilityEventDispatcherHandlers<TContext> {
    evaluateCondition: (condition: AbilityCondition, context: TContext) => boolean;
    applyEffect: (effect: AbilityEffect, context: TContext) => void;
}

export interface AbilityEventDispatchResult {
    matchedRuleIds: string[];
}

/** Create empty rule trigger counters for a fresh cast. */
export function createAbilityEventDispatchState(): AbilityEventDispatchState {
    return { ruleTriggerCounts: {} };
}

/**
 * Declarative dispatcher for ability event rules.
 * - AND within a rule: every condition must pass.
 * - OR across rules: each rule is evaluated independently.
 * - Deterministic ordering: higher priority first, then declaration order.
 */
export function dispatchAbilityEventRules<TContext>(
    rules: readonly AbilityEventRule[],
    state: AbilityEventDispatchState,
    context: TContext,
    handlers: AbilityEventDispatcherHandlers<TContext>,
): AbilityEventDispatchResult {
    const matchedRuleIds: string[] = [];
    const sortedRules = rules
        .map((rule, index) => ({ rule, originalIndex: index }))
        .sort((a, b) => {
            const priorityDiff = (b.rule.priority ?? 0) - (a.rule.priority ?? 0);
            if (priorityDiff !== 0) return priorityDiff;
            return a.originalIndex - b.originalIndex;
        });

    // Keys of rules processed so far in this dispatch (for ordering validation).
    const processedRuleKeys = new Set<string>();

    for (let i = 0; i < sortedRules.length; i++) {
        const sortedRule = sortedRules[i];
        if (!sortedRule) continue;
        const { rule, originalIndex } = sortedRule;
        const ruleKey = getRuleKey(rule, originalIndex);
        const triggerCount = state.ruleTriggerCounts[ruleKey] ?? 0;
        const maxTriggers = getMaxTriggersPerCast(rule);
        if (triggerCount >= maxTriggers) {
            processedRuleKeys.add(ruleKey);
            continue;
        }

        const allConditionsPass = rule.conditions.every((condition) => {
            // Guard: selfRuleHasTriggeredAtLeast must reference an earlier rule.
            if ((condition as { type: string }).type === 'selfRuleHasTriggeredAtLeast') {
                const ref = (condition as { ruleId: string }).ruleId;
                if (!processedRuleKeys.has(ref) && !(ref in state.ruleTriggerCounts)) {
                    console.warn(
                        `[AbilityEventDispatcher] selfRuleHasTriggeredAtLeast: rule "${ref}" ` +
                        `has not been processed before rule "${ruleKey}" in this dispatch. ` +
                        `Declare the referenced rule earlier or give it a higher priority.`,
                    );
                }
            }
            return handlers.evaluateCondition(condition, context);
        });
        if (!allConditionsPass) {
            processedRuleKeys.add(ruleKey);
            continue;
        }

        for (const effect of rule.effects) {
            handlers.applyEffect(effect, context);
        }

        state.ruleTriggerCounts[ruleKey] = triggerCount + 1;
        matchedRuleIds.push(ruleKey);
        processedRuleKeys.add(ruleKey);
    }

    return { matchedRuleIds };
}

function getRuleKey(rule: AbilityEventRule, index: number): string {
    return rule.id ?? `rule_${index}`;
}

function getMaxTriggersPerCast(rule: AbilityEventRule): number {
    if (typeof rule.maxTriggersPerCast === 'number') return Math.max(0, rule.maxTriggersPerCast);
    if (rule.oncePerCast) return 1;
    return Number.POSITIVE_INFINITY;
}
