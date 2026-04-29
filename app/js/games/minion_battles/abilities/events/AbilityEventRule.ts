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
    /** If true, this rule can fire at most once per cast instance. */
    oncePerCast?: boolean;
    /** Optional explicit cap per cast; ignored when omitted. */
    maxTriggersPerCast?: number;
    conditions: AbilityCondition[];
    effects: AbilityEffect[];
}
