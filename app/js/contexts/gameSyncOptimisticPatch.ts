import type { GameStatePayload } from '../types';

/** Phases where GameScreen uses BattleUISlotLayout instead of classic lobby chrome. */
export const UNIFIED_SLOT_LAYOUT_PHASES = [
    'character_select',
    'battle',
    'pre_mission_story',
    'post_mission_story',
] as const;

export type UnifiedSlotLayoutPhase = (typeof UNIFIED_SLOT_LAYOUT_PHASES)[number];

export function isUnifiedSlotLayoutPhase(
    phase: string | null | undefined,
): phase is UnifiedSlotLayoutPhase {
    return (
        phase === 'character_select'
        || phase === 'battle'
        || phase === 'pre_mission_story'
        || phase === 'post_mission_story'
    );
}

/**
 * Merge host-confirmed game fields into the in-memory GameSync payload so layout
 * gates (e.g. usesUnifiedSlotLayout) update without waiting for the next poll.
 * Returns null when GameSync has not loaded yet (caller should no-op).
 */
export function mergeOptimisticGameIntoPayload(
    prev: GameStatePayload | null,
    gamePatch: Record<string, unknown>,
): GameStatePayload | null {
    if (!prev) return null;
    return {
        ...prev,
        game: {
            ...(prev.game ?? {}),
            ...gamePatch,
        },
    };
}
