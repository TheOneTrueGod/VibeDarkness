/**
 * Types for player-created campaign characters.
 * All shapes are serializable for API and storage.
 */

import type { QuestResult, QuestRunState } from '../storylines/questTypes';

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
    /**
     * Per-tree map of nodeId → purchased level for multi-level (passive) research nodes.
     * Binary nodes stay in `researchTrees` only; leveled nodes appear in both
     * (`researchTrees` for presence/prereqs, this map for the current level).
     */
    researchNodeLevels?: Record<string, Record<string, number>>;
    /** Unix seconds; server sets when this character starts a mission as a playable unit. */
    lastUsed?: number;
    /**
     * Per-campaign mission results. Key = campaignId.
     * Each array holds at most one entry per missionId (the best/latest result).
     */
    missionResults?: Record<string, import('../../../types').MissionResult[]>;
    /**
     * Per-campaign quest results. Key = campaignId.
     * Source of truth for map banks / optional quest placement.
     */
    questResults?: Record<string, QuestResult[]>;
    /**
     * Singular active QuestRun for this Campaign Character (null/absent when none).
     * At most one prep/active run at a time — not a `questRuns` map.
     * Holds the Quest Character sheet for the current attempt.
     */
    activeQuestRun?: QuestRunState | null;
    /**
     * Last primary ability IDs selected on Prepare Carefully for a regular mission
     * (up to PREP_ABILITY_SLOT_COUNT). Used to pre-select on the next mission lobby.
     */
    lastMissionAbilityIds?: string[];
}

/** One-word reason a character cannot be used on a mission. */
export type CharacterDisallowReason =
    | 'campaign'
    | 'traits'
    | 'allowed'
    | 'disallowed';
