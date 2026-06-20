/**
 * Declarative condition variants for world modifier event rules.
 * All conditions in a rule must pass for the rule to trigger (AND semantics).
 * Rules across a trigger are evaluated independently (OR semantics).
 */
export type WorldCondition =
    | { type: 'always' }
    | { type: 'victimCharacterIdIs'; characterId: string }
    | { type: 'roundAtLeast'; round: number }
    | { type: 'roundAtMost'; round: number }
    | { type: 'counterAtLeast'; counterId: string; count: number }
    | { type: 'objectiveCompleted'; objectiveId: string }
    | WorldCustomCondition;

/**
 * Escape hatch for conditions needing bespoke runtime logic.
 * `comment` is required so intent is clear in data-first modifier definitions.
 */
export interface WorldCustomCondition {
    type: 'custom';
    conditionId: string;
    comment: string;
    params?: Record<string, unknown>;
}
