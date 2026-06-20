import type { AbilityCondition } from './AbilityCondition';
import type { AbilityEffect } from './AbilityEffect';
import type { AbilityEventRule } from './AbilityEventRule';
import {
    type DispatchableRule,
    dispatchEventRules,
} from '../../worldModifiers/EventRuleDispatcher';

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
 *
 * Thin wrapper over the generic {@link dispatchEventRules}; preserves the
 * ordering guard for `selfRuleHasTriggeredAtLeast` conditions.
 */
export function dispatchAbilityEventRules<TContext>(
    rules: readonly AbilityEventRule[],
    state: AbilityEventDispatchState,
    context: TContext,
    handlers: AbilityEventDispatcherHandlers<TContext>,
): AbilityEventDispatchResult {
    const processedRuleKeys = new Set<string>();

    const normalized: DispatchableRule<AbilityCondition, AbilityEffect>[] = rules.map(
        (rule, index) => ({
            id: rule.id,
            priority: rule.priority,
            maxTriggers: getMaxTriggersPerCast(rule),
            conditions: rule.conditions,
            effects: rule.effects,
        }),
    );

    const result = dispatchEventRules(normalized, state.ruleTriggerCounts, context, {
        evaluateCondition: (condition, ctx) => {
            // Guard: selfRuleHasTriggeredAtLeast must reference an earlier rule.
            if ((condition as { type: string }).type === 'selfRuleHasTriggeredAtLeast') {
                const ref = (condition as { ruleId: string }).ruleId;
                if (!processedRuleKeys.has(ref) && !(ref in state.ruleTriggerCounts)) {
                    console.warn(
                        `[AbilityEventDispatcher] selfRuleHasTriggeredAtLeast: rule "${ref}" ` +
                        `has not been processed before the current rule in this dispatch. ` +
                        `Declare the referenced rule earlier or give it a higher priority.`,
                    );
                }
            }
            return handlers.evaluateCondition(condition, ctx);
        },
        applyEffect: handlers.applyEffect,
        onRuleProcessed: (key) => processedRuleKeys.add(key),
    });

    return { matchedRuleIds: result.matchedRuleIds };
}

function getMaxTriggersPerCast(rule: AbilityEventRule): number {
    if (typeof rule.maxTriggersPerCast === 'number') return Math.max(0, rule.maxTriggersPerCast);
    if (rule.oncePerCast) return 1;
    return Number.POSITIVE_INFINITY;
}
