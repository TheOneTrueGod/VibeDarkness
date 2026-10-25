/** Pure helpers for the Minion Battles Game component (no React state). */
import type { GamePhase } from './state';
import { MISSION_MAP } from './storylines';

export function getSelectedMissionId(data: Record<string, unknown>): string | null {
    const missionId = data.selectedMissionId ?? data.selected_mission_id;
    return typeof missionId === 'string' && missionId.trim() !== '' ? missionId : null;
}

/**
 * Infer battle phase when gamePhase is missing but engine state (units, gameTick) exists.
 * This happens when loading from checkpoints that lack phase metadata.
 */
export function inferPhase(raw: Record<string, unknown>): GamePhase {
    const explicit = (raw.gamePhase ?? raw.game_phase) as GamePhase | undefined;
    if (explicit) return explicit;
    const hasBattleData =
        (Array.isArray(raw.units) && raw.units.length > 0) ||
        typeof (raw.gameTick ?? raw.game_tick) === 'number';
    return hasBattleData ? 'battle' : 'character_select';
}

/**
 * Starting items granted via pre-mission story (choice equip_item / group vote grant_item_to_player).
 * Derived by intersecting the player's battle-start equipment with the set of possible pre-mission reward items.
 * `state` is the latest game state (last server state, falling back to the raw game data).
 */
export function getStartingItemIdsForPlayer(
    mid: string,
    pid: string,
    state: Record<string, unknown>,
): string[] {
    const def = MISSION_MAP[mid];
    const pre = def?.preMissionStory as unknown;

    const possible = new Set<string>();
    if (pre && typeof pre === 'object') {
        const phrases = (pre as { phrases?: unknown }).phrases;
        if (Array.isArray(phrases)) {
            for (const phrase of phrases) {
                if (!phrase || typeof phrase !== 'object') continue;
                const p = phrase as Record<string, unknown>;

                if (p.type === 'choice') {
                    const options = p.options;
                    if (Array.isArray(options)) {
                        for (const opt of options) {
                            if (!opt || typeof opt !== 'object') continue;
                            const action = (opt as Record<string, unknown>).action as
                                | Record<string, unknown>
                                | undefined;
                            if (!action) continue;
                            if (action.type === 'equip_item' && typeof action.itemId === 'string') {
                                possible.add(action.itemId);
                            }
                        }
                    }
                }

                if (p.type === 'groupVote') {
                    const effect = p.effect as Record<string, unknown> | undefined;
                    if (effect?.type === 'grant_item_to_player' && typeof effect.itemId === 'string') {
                        possible.add(effect.itemId);
                    }
                }
            }
        }
    }

    const equipByPlayer = state.playerEquipmentByPlayer as Record<string, string[]> | undefined;
    const equipment = (equipByPlayer?.[pid] ?? []) as string[];
    return [...possible].filter((id) => equipment.includes(id));
}
