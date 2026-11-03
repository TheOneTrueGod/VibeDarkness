import type { AbilityCondition } from './AbilityCondition';
import type { AbilityEffect } from './AbilityEffect';

/**
 * Declarative rule for a single ability event trigger.
 * - `conditions`: all must pass (AND)
 * - rules across a trigger are evaluated independently (OR)
 */
export interface AbilityEventRule {
    /** Optional identifier for analytics/debugging and stable runtime counters. */
    id?: string;
    /** Optional sort key. Higher priority runs first. Default 0. */
    priority?: number;
    conditions: AbilityCondition[];
    effects: AbilityEffect[];
}
