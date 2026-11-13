/**
 * Types for player-created campaign characters.
 * All shapes are serializable for API and storage.
 */

import type { QuestResult } from '../storylines/questTypes';
import type { ActiveQuestRunsMap } from '../storylines/activeQuestRuns';
import type { ResearchNodeSources } from '../../../researchTrees/types';

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
    /**
     * Per-tree map of nodeId → source of each owned level.
     * Missing entries are treated as Purchased (legacy characters).
     */
    researchSources?: ResearchNodeSources;
    /** Per core-tree "tree level" (treeId -> level). Gates research ranks; see researchTrees/treeLevels.ts. */
    researchTreeLevels?: Record<string, number>;
    /** Unix seconds; server sets when this character starts a mission as a playable unit. */
    lastUsed?: number;
    /** Fraction of max Hunger the character started with (new characters 0.3); absent on legacy characters = full. */
    startingHungerFraction?: number;
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
     * Prep/active quest runs keyed by `runId`. Absent on load becomes `{}`.
     * At most one prep/active run per `questDefId` (enforced when upserting).
     */
    activeQuestRuns?: ActiveQuestRunsMap;
    /**
     * Default prep loadout: the primary ability IDs (up to PREP_ABILITY_SLOT_COUNT, in slot order)
     * the player last picked or reordered on Prepare Carefully / Quest Prep. Seeds the next prep;
     * ids no longer selectable are dropped. Missing on old saves (falls back to the first slots).
     */
    lastMissionAbilityIds?: string[];
    /**
     * Per-campaign location card decks. Key = campaignId, value = list of location card instances.
     * Built from quest rewards; used to populate location_encounter slots.
     */
    locationDeck?: Record<string, unknown>;
}

/** One-word reason a character cannot be used on a mission. */
export type CharacterDisallowReason =
    | 'campaign'
    | 'traits'
    | 'allowed'
    | 'disallowed';
