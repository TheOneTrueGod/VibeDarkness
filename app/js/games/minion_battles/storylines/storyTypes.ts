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
    /** When set, also grants this research node to the player's campaign character. */
    alsoGrantResearch?: { treeId: string; nodeId: string };
}

/** Choice action: grant campaign resources (used in post-mission choices). */
export interface StoryChoiceActionGrantResources {
    type: 'grant_resources';
    food?: number;
    metal?: number;
    crystals?: number;
    /**
     * Also grant these resources to every other non-spectator player when they complete
     * this choice phrase (stacks with their own choice). Requires the post-mission phase
     * to wait until all players have chosen before finalizing rewards.
     */
    alsoGrantToOthers?: {
        food?: number;
        metal?: number;
        crystals?: number;
    };
}

/** Choice action: grant one research node to the player's selected campaign character. */
export interface StoryChoiceActionGrantResearchToPlayer {
    type: 'grant_research_to_player';
    treeId: string;
    nodeId: string;
}

/** Choice action: grant one of several research nodes based on equipped items. */
export interface StoryChoiceActionGrantResearchConditional {
    type: 'grant_research_conditional';
    candidates: Array<{
        equippedItemId: string;
        treeId: string;
        nodeId: string;
    }>;
}

/** Extensible choice action union. */
export type StoryChoiceAction =
    | StoryChoiceActionEquipItem
    | StoryChoiceActionGrantResources
    | StoryChoiceActionGrantResearchToPlayer
    | StoryChoiceActionGrantResearchConditional;

/** One row in a choice phrase (pre- or post-mission). */
export interface StoryChoiceOptionRow {
    id: string;
    /** Stable id for saves / analytics; UI may prefer `loreTitle` when set. */
    label: string;
    /** Player-facing heading when present (e.g. post-mission reward picks). */
    loreTitle?: string;
    /** Short flavor line under the heading. */
    loreDescription?: string;
    action: StoryChoiceAction;
    disabledLabel?: string;
    /**
     * When true, this option is tailored for the viewing player — sort to the top and
     * show the star + "For you" badge in post-mission reward UI.
     */
    forYou?: boolean;
}

/**
 * One option slot for a config-driven research reward choice.
 * - Specific: `treeId` + `nodeId` — always resolves to that exact node; prereqs and
 *   exclusivity are intentionally bypassed (the designer is making a deliberate grant).
 * - Filter: omit `nodeId`; the resolver picks the first available node matching the
 *   optional `treeId` and `minTier`/`maxTier` range. By default prereqs and exclusivity
 *   ARE checked so players only see nodes they could structurally unlock. Set
 *   `respectRequirements: false` to revert to the old behaviour and bypass those checks.
 * `loreTitle`/`loreDescription` override the node's own title/flavorText in the UI.
 */
export type ResearchRewardSlot =
    | { treeId: string; nodeId: string; loreTitle?: string; loreDescription?: string }
    | { nodeId?: never; treeId?: string; minTier?: number; maxTier?: number; loreTitle?: string; loreDescription?: string; respectRequirements?: boolean };

/** Choice phrase: player selects one option; action is applied (e.g. equip item). */
export interface ChoicePhrase {
    type: 'choice';
    choiceId: string;
    /**
     * For dynamic rewards, use an empty or placeholder `options` array and implement
     * `MissionBattleConfig.getPostMissionChoiceOptions` on the mission def (see `types.ts`).
     * Alternatively, set `researchRewardSlots` for config-driven resolution (see below).
     */
    options: StoryChoiceOptionRow[];
    /**
     * When set, overrides `options` — each slot resolves to one `StoryChoiceOptionRow`
     * granting a research node. No `getPostMissionChoiceOptions` override needed.
     */
    researchRewardSlots?: ResearchRewardSlot[];
    /** Full-screen background while the choice grid is shown; fades when changing. */
    backgroundImage?: string;
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

export interface GroupVoteEffectGrantResearchToPlayer {
    type: 'grant_research_to_player';
    treeId: string;
    nodeId: string;
}

export type GroupVoteEffect = GroupVoteEffectGrantItemToPlayer | GroupVoteEffectGrantResearchToPlayer;

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

/**
 * Auto-grant a research node to every non-spectator player at this point in the post-mission story.
 * No UI is shown; the client sends the grant silently and advances. Idempotent on the server.
 */
export interface GrantResearchAutoPhrase {
    type: 'grant_research_auto';
    treeId: string;
    nodeId: string;
    /**
     * Skip the grant for this player if they already hold any of the listed
     * nodes in the given tree (checked client-side before sending the message).
     */
    skipIfResearched?: { treeId: string; nodeIds: string[] }[];
}

/** Post-mission phrase: dialogue, per-player choice, or silent auto-grant. */
export type PostMissionPhrase = DialoguePhrase | ChoicePhrase | GrantResearchAutoPhrase;

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
