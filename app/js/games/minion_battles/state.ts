/**
 * Special character selection value meaning the player is spectating (no character, no orders, no rewards).
 */
export const SPECTATOR_ID = 'spectator';

/**
 * Prefix for NPC-control character selections (`control_enemy:<groupId>`).
 * Group id is the resolved playerControl id (id ?? controlGroupId ?? unitTag).
 */
export const CONTROL_ENEMY_PREFIX = 'control_enemy:';

/**
 * Legacy selection for Mission Monster (boss): player controls the Alpha Wolf.
 * Prefer {@link makeControlSelection}(`'boss'`) for new code; kept for old lobby state.
 */
export const CONTROL_ENEMY_ALPHA_WOLF = 'control_enemy_alpha_wolf';

/** Group id used when mapping the legacy {@link CONTROL_ENEMY_ALPHA_WOLF} selection. */
const LEGACY_CONTROL_GROUP_ID = 'boss';

/** Build a character-selection value for controlling an NPC group. */
export function makeControlSelection(groupId: string): string {
    return `${CONTROL_ENEMY_PREFIX}${groupId}`;
}

export function isSpectator(characterId: string | undefined | null): boolean {
    return characterId === SPECTATOR_ID;
}

/** True when the selection is an NPC-control value (new prefix or legacy constant). */
export function isControlEnemy(characterId: string | undefined | null): boolean {
    if (characterId == null || characterId === '') return false;
    if (characterId === CONTROL_ENEMY_ALPHA_WOLF) return true;
    return characterId.startsWith(CONTROL_ENEMY_PREFIX);
}

/**
 * Resolved control group id for a selection, or null if not an NPC-control selection.
 * Legacy {@link CONTROL_ENEMY_ALPHA_WOLF} maps to `'boss'`.
 */
export function getControlGroupId(sel: string | undefined | null): string | null {
    if (sel == null || sel === '') return null;
    if (sel === CONTROL_ENEMY_ALPHA_WOLF) return LEGACY_CONTROL_GROUP_ID;
    if (!sel.startsWith(CONTROL_ENEMY_PREFIX)) return null;
    const groupId = sel.slice(CONTROL_ENEMY_PREFIX.length);
    return groupId === '' ? null : groupId;
}

/**
 * Minion Battles game state (from server or createInitialState).
 * Server sends snake_case (lobby_id, players, hands); we accept both for compatibility.
 */
export type GamePhase =
    | 'start'
    | 'character_select'
    | 'pre_mission_story'
    | 'battle'
    | 'post_mission_story'
    | 'in_mission';

export interface MinionBattlesState {
    lobbyId?: string;
    lobby_id?: string;
    players: string[];
    hands: Record<string, string[]>;
    gamePhase?: GamePhase;
    game_phase?: GamePhase;
    selectedMissionId?: string;
    selected_mission_id?: string;
    /** Active quest lobby stamp (mirrors MinionBattlesGameStatePayload). */
    questDefId?: string;
    questRunId?: string;
    questSlotIndex?: number;
    /** Map of playerId -> characterId for character selections */
    characterSelections?: Record<string, string>;
    character_selections?: Record<string, string>;
    /** Per-player combatant display names (campaign character names) for battles. */
    characterDisplayNames?: Record<string, string>;
    character_display_names?: Record<string, string>;
    /** Story choice results: playerId -> choiceId -> optionId (option id from choice phrase). */
    playerStoryChoices?: Record<string, Record<string, string>>;
    /** Derived or stored: playerId -> item IDs equipped from story (e.g. from playerStoryChoices). */
    playerEquippedItems?: Record<string, string[]>;
    /** Player research trees snapshot for runtime battle logic. */
    playerResearchTreesByPlayer?: Record<string, Record<string, string[]>>;
    /** Multi-level research node counts (playerId → treeId → nodeId → level). */
    playerResearchNodeLevelsByPlayer?: Record<string, Record<string, Record<string, number>>>;
}

export interface MinionBattlesGameOptions {
    gameId?: string | null;
    gameType?: string;
    gameData?: Record<string, unknown> | null;
}
