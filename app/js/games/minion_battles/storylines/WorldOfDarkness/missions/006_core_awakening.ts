/**
 * Core Awakening - Mission 6: Story-only reward pick after The Beast (core items).
 *
 * Offers up to {@link CORE_AWAKENING_OPTION_COUNT} random tier-10 root research nodes
 * (prereq-free "core" unlocks discovered from {@link RESEARCH_TREES}).
 * Cores may declare a target-audience player-id list; matching players see those first
 * with a "For you" treatment in the UI.
 */

import { BaseMissionDef } from '../../BaseMissionDef';
import type { PostMissionStoryDef, StoryChoiceOptionRow } from '../../storyTypes';
import type { PostMissionChoiceResolveParams } from '../../types';
import { STORY_BACKGROUNDS } from '../../../assets/story';
import { TerrainGrid, CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { RESEARCH_TREES, getResearchNode } from '../../../../../researchTrees/list';
import { isDraftResearchNode } from '../../../../../researchTrees/types';
import { GRAVITY_TREE_ID, GRAVITY_NODE_CORE } from '../../../../../researchTrees/trees/gravity';
import {
    COMMAND_CORE_TREE_ID,
    COMMAND_CORE_NODE_LOYAL_COMPANION,
} from '../../../../../researchTrees/trees/command_core';
import { LIGHT_TREE_ID, LIGHT_NODE_CORE } from '../../../../../researchTrees/trees/light';
import { BLOOD_MAGE_TREE_ID, BLOOD_MAGE_NODE_CORE } from '../../../../../researchTrees/trees/blood_mage';
import {
    MISC_TREE_ID,
    MISC_NODE_BLINK_CORE,
} from '../../../../../researchTrees/trees/misc';

function createTerrain(): TerrainGrid {
    return TerrainGrid.createTerrainFromArray(1, 1, CELL_SIZE, [[TerrainType.Grass]], TerrainType.Grass);
}

/** Research tier used for Core Awakening candidate discovery. */
export const CORE_AWAKENING_TIER = 10;

/** How many core options to offer when more are eligible. */
export const CORE_AWAKENING_OPTION_COUNT = 8;

function coreCandidateKey(treeId: string, nodeId: string): string {
    return `${treeId}+${nodeId}`;
}

/**
 * Account player IDs that a given core is tailored for (shown with "For you" + sort priority).
 * Keys are `${treeId}+${nodeId}` (same as candidate ids).
 */
export const CORE_TARGET_PLAYER_IDS: Readonly<Record<string, readonly string[]>> = {
    [coreCandidateKey(GRAVITY_TREE_ID, GRAVITY_NODE_CORE)]: ['16', '11'],
    [coreCandidateKey(COMMAND_CORE_TREE_ID, COMMAND_CORE_NODE_LOYAL_COMPANION)]: ['8', '17'],
    [coreCandidateKey(LIGHT_TREE_ID, LIGHT_NODE_CORE)]: ['10'],
    [coreCandidateKey(BLOOD_MAGE_TREE_ID, BLOOD_MAGE_NODE_CORE)]: ['23'],
    [coreCandidateKey(MISC_TREE_ID, MISC_NODE_BLINK_CORE)]: ['1'],
};

export interface CoreAwakeningCandidate {
    id: string;
    treeId: string;
    nodeId: string;
    label: string;
    /** Account player IDs this core is tailored for (empty = no target audience). */
    targetPlayerIds: readonly string[];
}

/** Whether `playerId` is in the core's target audience. */
export function isCoreForPlayer(
    candidate: Pick<CoreAwakeningCandidate, 'targetPlayerIds'>,
    playerId: string | undefined,
): boolean {
    if (!playerId) return false;
    return candidate.targetPlayerIds.includes(playerId);
}

/** Player-facing choice label from tree + node titles. */
export function coreChoiceLabel(treeTitle: string, nodeTitle: string): string {
    if (/core/i.test(nodeTitle)) {
        return /^the\s/i.test(nodeTitle) ? nodeTitle : `The ${nodeTitle}`;
    }
    if (/core/i.test(treeTitle)) {
        return /^the\s/i.test(treeTitle) ? treeTitle : `The ${treeTitle}`;
    }
    return `The ${treeTitle} Core`;
}

/**
 * Tier-10 research nodes with no prereqs — the pool of "core" unlocks for this mission.
 * Sorted by id so shuffle seeds stay stable as trees are registered.
 */
export function listTier10RootCoreCandidates(): CoreAwakeningCandidate[] {
    const out: CoreAwakeningCandidate[] = [];
    for (const tree of RESEARCH_TREES) {
        for (const node of tree.nodes) {
            if (node.tier !== CORE_AWAKENING_TIER) continue;
            if (isDraftResearchNode(node)) continue;
            if (node.prereqNodeIds.length > 0) continue;
            const id = coreCandidateKey(tree.id, node.id);
            out.push({
                id,
                treeId: tree.id,
                nodeId: node.id,
                label: coreChoiceLabel(tree.title, node.title),
                targetPlayerIds: CORE_TARGET_PLAYER_IDS[id] ?? [],
            });
        }
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
}

function isCoreEligible(
    treeId: string,
    nodeId: string,
    researchedTrees: Record<string, string[]>,
    equippedItemIds: readonly string[],
): boolean {
    const node = getResearchNode(treeId, nodeId);
    if (!node) return false;
    for (const req of node.requirements) {
        if (req.type === 'anyResearched') {
            const inTree = researchedTrees[req.treeId] ?? [];
            if (!req.nodeIds.some((id) => inTree.includes(id))) return false;
        } else if (req.type === 'characterHasEquippedItem') {
            if (!equippedItemIds.includes(req.itemId)) return false;
        }
    }
    return true;
}

/** FNV-1a 32-bit hash — stable seed for UI shuffle (not engine RNG). */
function hashSeed(input: string): number {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
        h ^= input.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/** Mulberry32 PRNG — deterministic from seed so lobby polls do not reshuffle options. */
function mulberry32(seed: number): () => number {
    return () => {
        let t = (seed += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Deterministic Fisher–Yates shuffle. Same seed + same input order → same output.
 * Used so post-mission choice rows stay stable across React re-renders from lobby polling.
 */
export function seededShuffle<T>(arr: readonly T[], seed: string): T[] {
    const rand = mulberry32(hashSeed(seed));
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/**
 * Build the offered list: all eligible "for you" cores first (guaranteed inclusion),
 * then fill remaining slots from a seeded shuffle of the rest.
 */
export function pickCoreAwakeningOptions(
    eligible: readonly CoreAwakeningCandidate[],
    playerId: string | undefined,
    seed: string,
    optionCount: number = CORE_AWAKENING_OPTION_COUNT,
): CoreAwakeningCandidate[] {
    const forYou = eligible.filter((c) => isCoreForPlayer(c, playerId));
    const others = eligible.filter((c) => !isCoreForPlayer(c, playerId));
    const ordered = [
        ...seededShuffle(forYou, `${seed}|forYou`),
        ...seededShuffle(others, `${seed}|others`),
    ];
    return ordered.slice(0, optionCount);
}

const POST_MISSION_STORY: PostMissionStoryDef = {
    phrases: [
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'The Beast is defeated. The cave falls silent, and your breath steadies in the dark.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'As the beast falls, you feel a new power stirring awake within you, answering the clash you survived.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'dialogue',
            speakerId: '1',
            text: 'Choose the core you will awaken next.',
            portraitSide: 'left',
            backgroundImage: STORY_BACKGROUNDS.campfire,
        },
        {
            type: 'choice',
            choiceId: 'core_awakening_reward',
            options: [],
        },
    ],
};

export class CoreAwakeningMission extends BaseMissionDef {
    getPostMissionChoiceOptions(params: PostMissionChoiceResolveParams): StoryChoiceOptionRow[] | null {
        if (params.choiceId !== 'core_awakening_reward') return null;

        const trees = params.playerResearchTrees ?? {};
        const candidates = listTier10RootCoreCandidates();

        const anyOwned = candidates.some(({ treeId, nodeId }) =>
            (trees[treeId] ?? []).includes(nodeId),
        );
        if (anyOwned) return null;

        const eligible = candidates.filter(({ treeId, nodeId }) =>
            isCoreEligible(treeId, nodeId, trees, params.equippedItemIds),
        );

        // Seed from player + choice + eligible set so lobby poll re-renders keep the same order.
        const seed = [
            params.playerId ?? '',
            params.choiceId,
            eligible.map((c) => c.id).join(','),
        ].join('|');

        return pickCoreAwakeningOptions(eligible, params.playerId, seed).map(({ id, treeId, nodeId, label, targetPlayerIds }) => ({
            id,
            label,
            forYou: isCoreForPlayer({ targetPlayerIds }, params.playerId),
            action: { type: 'grant_research_to_player', treeId, nodeId },
        }));
    }

    missionId = 'core_awakening';
    mapPosition = { x: 610, y: 350 };
    missionType = 'story' as const;
    description = 'A deep resonance stirs within. An awakening that will change the path ahead.';
    campaignId = 'world_of_darkness';
    name = 'Core Awakening';
    worldWidth = CELL_SIZE;
    worldHeight = CELL_SIZE;
    enemies = [];
    createTerrain = createTerrain;
    postMissionStory = POST_MISSION_STORY;
    skipBattle = true;
    lightLevelEnabled = false;
}

export const CORE_AWAKENING = new CoreAwakeningMission();
