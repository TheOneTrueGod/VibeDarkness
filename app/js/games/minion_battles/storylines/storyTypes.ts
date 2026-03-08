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

/** Extensible choice action union. */
export type StoryChoiceAction = StoryChoiceActionEquipItem;

/** Choice phrase: player selects one option; action is applied (e.g. equip item). */
export interface ChoicePhrase {
    type: 'choice';
    choiceId: string;
    options: { id: string; label: string; action: StoryChoiceAction }[];
}

export type PreMissionPhrase = DialoguePhrase | ChoicePhrase;

/** Pre-mission story shown in lobby after character select, before battle. */
export interface PreMissionStoryDef {
    phrases: PreMissionPhrase[];
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
