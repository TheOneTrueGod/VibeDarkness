/**
 * Types for player-created campaign characters.
 * All shapes are serializable for API and storage.
 */

/** Allowed trait strings for characters (extend as needed). */
export type CharacterTrait =
    | 'brave'
    | 'cunning'
    | 'wise'
    | 'swift'
    | 'steadfast'
    | 'shadow'
    | 'holy'
    | 'dark';

/** Battle chip display details (letter, inner circle colour, optional image). */
export interface BattleChipDetails {
    letter?: string;
    innerCircleColor?: string;
    image?: string;
}

/** Knowledge entry value: map from knowledge_id to details. */
export interface KnowledgeDetails {
    [knowledgeId: string]: Record<string, unknown>;
}

/** Serializable campaign character data (from server or to send). */
export interface CampaignCharacterData {
    id: string;
    ownerAccountId?: number;
    /** Display name (e.g. from random pool when created). */
    name?: string;
    equipment: string[];
    knowledge: Record<string, Record<string, unknown>>;
    traits: string[];
    portraitId: string;
    battleChipDetails: BattleChipDetails;
    campaignId: string;
    missionId: string;
    researchTrees?: Record<string, string[]>;
    /** Unix seconds; server sets when this character starts a mission as a playable unit. */
    lastUsed?: number;
    /**
     * Per-campaign mission results. Key = campaignId.
     * Each array holds at most one entry per missionId (the best/latest result).
     */
    missionResults?: Record<string, import('../../../types').MissionResult[]>;
}

/** One-word reason a character cannot be used on a mission. */
export type CharacterDisallowReason =
    | 'campaign'
    | 'traits'
    | 'allowed'
    | 'disallowed';
