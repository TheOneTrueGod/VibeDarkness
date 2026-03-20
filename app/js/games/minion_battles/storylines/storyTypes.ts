/**
 * Story segment types for pre-mission and in-battle story (visual novel style).
 * Strongly typed phrase union; choice actions are extensible.
 */

/** Which side the speaker's portrait appears on. */
export type PortraitSide = 'left' | 'right';

/** Up to 4 portrait slots; each phrase can specify which NPCs appear and where. */
export interface PortraitLayout {
    left?: string[];
    right?: string[];
}

/** Reusable text effect for dialogue (e.g. title_bounce = large, centered, purple, per-char bounce). */
export type StoryTextEffect = 'title_bounce';

/** Dialogue phrase: a single line from a character. */
export interface DialoguePhrase {
    type: 'dialogue';
    speakerId: string;
    text: string;
    portraitSide?: PortraitSide;
    portraitSlot?: number;
    /** Which NPC IDs to show (left/right arrays, max 4 total). */
    portraits?: PortraitLayout;
    /** Full-screen background image URL; fades when changing. */
    backgroundImage?: string;
    /** Optional named text effect (e.g. title_bounce) instead of default dialogue box. */
    textEffect?: StoryTextEffect;
}

/** Choice action: equip_item adds cards to deck at battle start. */
export interface StoryChoiceActionEquipItem {
    type: 'equip_item';
    itemId: string;
}

/** Choice action: grant campaign resources (used in post-mission choices). */
export interface StoryChoiceActionGrantResources {
    type: 'grant_resources';
    food?: number;
    metal?: number;
    crystals?: number;
}

/** Extensible choice action union. */
export type StoryChoiceAction = StoryChoiceActionEquipItem | StoryChoiceActionGrantResources;

/** Choice phrase: player selects one option; action is applied (e.g. equip item). */
export interface ChoicePhrase {
    type: 'choice';
    choiceId: string;
    options: { id: string; label: string; action: StoryChoiceAction }[];
}

/**
 * Grant equipment to a single random player (deterministically).
 *
 * The backend uses a serialized random seed derived from lobbyId, gameId, missionId,
 * phraseIndex, and optional seedSuffix so all clients stay in sync.
 * This phrase has no UI; it is applied before advancing to the next phrase.
 */
export interface GrantEquipmentRandomPhrase {
    type: 'grant_equipment_random';
    itemId: string;
    /** Optional extra salt for the deterministic seed (e.g. mission-specific). */
    seedSuffix?: string;
}

/** Effect applied when a group vote is resolved (majority wins; tie = serialized random). */
export interface GroupVoteEffectGrantItemToPlayer {
    type: 'grant_item_to_player';
    itemId: string;
}

export type GroupVoteEffect = GroupVoteEffectGrantItemToPlayer;

/**
 * Group vote: all players must select an option; story does not progress until everyone has voted.
 * Each player's vote is shown live. Majority wins; on tie, a deterministic (serialized) option is chosen.
 * The winning option can trigger an effect (e.g. grant an item to that player).
 */
export interface GroupVotePhrase {
    type: 'groupVote';
    /** Unique id for this vote (e.g. mission + semantic name). */
    voteId: string;
    /** Text explaining what the group is voting on. */
    text: string;
    /** Static options. If omitted, use optionSource to build options at runtime. */
    options?: { id: string; label: string }[];
    /** If 'players', options are built from lobby players (id = playerId, label = player name). */
    optionSource?: 'players';
    /** Effect applied to the winning option (e.g. grant item to that player). */
    effect?: GroupVoteEffect;
}

export type PreMissionPhrase =
    | DialoguePhrase
    | ChoicePhrase
    | GrantEquipmentRandomPhrase
    | GroupVotePhrase;

/** Pre-mission story shown in lobby after character select, before battle. */
export interface PreMissionStoryDef {
    phrases: PreMissionPhrase[];
}

/** Post-mission phrase: dialogue or per-player choice (each player chooses independently). */
export type PostMissionPhrase = DialoguePhrase | ChoicePhrase;

/** Post-mission story shown after victory, before the victory screen. */
export interface PostMissionStoryDef {
    phrases: PostMissionPhrase[];
}

// --- In-battle story (infrastructure only; no runtime handling yet) ---

export type InBattleStoryTrigger = 'start' | 'victory' | 'defeat' | 'mid_battle';

export interface MidBattleTriggerDetail {
    atRound?: number;
    onEvent?: string;
}

export type InBattlePhrase = DialoguePhrase | ChoicePhrase;

/** In-battle story segment; same phrase types as pre-mission. */
export interface InBattleStoryDef {
    trigger: InBattleStoryTrigger;
    triggerDetail?: MidBattleTriggerDetail;
    phrases: InBattlePhrase[];
}
