/**
 * Generic declarative rule dispatcher shared by the ability event system and
 * the world modifier system.
 *
 * Rules are evaluated in priority order (higher first), then declaration order.
 * Within a rule all conditions must pass (AND). Rules are independent (OR).
 */

/** Normalized rule shape accepted by {@link dispatchEventRules}. */
export interface DispatchableRule<TCondition, TEffect> {
    id?: string;
    priority?: number;
    /** Infinity = unlimited; computed by the caller from the native rule format. */
    maxTriggers: number;
    /** When true, no further rules run after this rule matches. */
    exclusive?: boolean;
    conditions: TCondition[];
    effects: TEffect[];
}

export interface EventDispatchHandlers<TCondition, TEffect, TContext> {
    evaluateCondition(cond: TCondition, ctx: TContext): boolean;
    applyEffect(effect: TEffect, ctx: TContext): void;
    /**
     * Called after each rule is fully processed (matched or not).
     * Used by callers that need to track which rules have run before a later
     * condition is evaluated (e.g. ability dispatcher ordering guard).
     */
    onRuleProcessed?(key: string): void;
}

export interface EventDispatchResult {
    matchedRuleIds: string[];
    wasExclusive: boolean;
}

/**
 * Core dispatch loop.  `triggerCounts` is mutated in place — the caller owns
 * it and may persist it across invocations (world modifiers use per-lifetime
 * counts; ability casts use per-cast counts).
 */
export function dispatchEventRules<TCondition, TEffect, TContext>(
    rules: DispatchableRule<TCondition, TEffect>[],
    triggerCounts: Record<string, number>,
    context: TContext,
    handlers: EventDispatchHandlers<TCondition, TEffect, TContext>,
): EventDispatchResult {
    const matchedRuleIds: string[] = [];
    let wasExclusive = false;

    const sortedRules = rules
        .map((rule, index) => ({ rule, index }))
        .sort((a, b) => {
            const diff = (b.rule.priority ?? 0) - (a.rule.priority ?? 0);
            return diff !== 0 ? diff : a.index - b.index;
        });

    for (const { rule, index } of sortedRules) {
        const key = rule.id ?? `rule_${index}`;
        const count = triggerCounts[key] ?? 0;

        if (count >= rule.maxTriggers) {
            handlers.onRuleProcessed?.(key);
            continue;
        }

        const allPass = rule.conditions.every((c) => handlers.evaluateCondition(c, context));

        if (allPass) {
            for (const effect of rule.effects) {
                handlers.applyEffect(effect, context);
            }
            triggerCounts[key] = count + 1;
            matchedRuleIds.push(key);
        }

        handlers.onRuleProcessed?.(key);

        if (allPass && rule.exclusive) {
            wasExclusive = true;
            break;
        }
    }

    return { matchedRuleIds, wasExclusive };
}
