import type { WorldCondition } from './WorldCondition';
import type { WorldEffect } from './WorldEffect';

/** Event types that WorldModifierManager subscribes to on the EventBus. */
export type WorldEventType = 'on_unit_died' | 'on_round_start' | 'on_round_end';

/**
 * Stub for ambient effects (e.g. Rainy Storm visual overlay).
 * Full implementation deferred to post-v1.
 */
export interface WorldAmbientEffect {
    type: string;
    params?: Record<string, unknown>;
}

/** Declarative rule attached to a world event trigger. */
export interface WorldEventRule {
    /** Optional identifier for debugging and once-tracking. */
    id?: string;
    /** Sort key; higher runs first. Default 0. */
    priority?: number;
    /** If true, this rule fires at most once per modifier instance lifetime. */
    once?: boolean;
    /** Optional hard cap on total trigger count. */
    maxTriggers?: number;
    /**
     * When true, no further rules for this event run after this rule matches.
     * Used for exclusive handlers (e.g. alpha wolf story death sequence).
     */
    exclusive?: boolean;
    conditions: WorldCondition[];
    effects: WorldEffect[];
}

/** JSON-safe, immutable definition for a world modifier. */
export interface WorldModifierDef {
    id: string;
    name: string;
    description: string;
    /** Inline SVG or bundled asset key — same pattern as ability card icons. */
    icon: string;

    /** Sort key when multiple modifiers react to the same event. Higher runs first. */
    priority?: number;

    /** Conditional activation — modifier is inactive outside this round window. */
    activeFromRound?: number;
    activeUntilRound?: number;
    /** Modifier stays inactive until the named objective is completed. */
    requiresObjectiveCompletedId?: string;

    /** Instance starts disabled when true; can be toggled mid-battle via manager API. */
    startsDisabled?: boolean;

    /** Always-on effects while modifier is active. Stub in v1; full in Rainy Storm follow-up. */
    ambient?: WorldAmbientEffect[];

    rules?: Partial<Record<WorldEventType, WorldEventRule[]>>;
}

/** Checkpoint-safe instance state for one active world modifier. */
export interface SerializedWorldModifierInstance {
    id: string;
    disabled: boolean;
    /** Per-`incrementCounter` effect accumulators (game counters, not rule-trigger bookkeeping). */
    counters: Record<string, number>;
    /** Per-rule trigger counts, keyed by rule id or `${modId}_${eventType}_${index}`. Handles once/maxTriggers. */
    ruleTriggerCounts?: Record<string, number>;
    /** Full def JSON for modifiers added mid-battle (not present in mission defs). */
    dynamicDef?: WorldModifierDef;
    /** Legacy / human-readable list of rule ids that fired with `once: true`. Superseded by ruleTriggerCounts. */
    firedOnceRuleIds?: string[];
}
