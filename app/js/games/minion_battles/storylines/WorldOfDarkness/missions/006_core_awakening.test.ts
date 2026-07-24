/**
 * Core Awakening post-mission choice options must stay stable across re-resolves
 * (lobby polls re-render PostMissionStoryPhase with new object identities).
 */
import { describe, expect, it } from 'vitest';
import {
    CORE_AWAKENING,
    CORE_AWAKENING_OPTION_COUNT,
    CORE_AWAKENING_TIER,
    CORE_TARGET_PLAYER_IDS,
    coreChoiceLabel,
    listTier10RootCoreCandidates,
    pickCoreAwakeningOptions,
    seededShuffle,
} from './006_core_awakening';
import { EARTH_TREE_ID, EARTH_NODE_EARTH_CORE } from '../../../../../researchTrees/trees/earth';
import { GRAVITY_TREE_ID, GRAVITY_NODE_CORE } from '../../../../../researchTrees/trees/gravity';
import {
    MISC_NODE_AIR_CORE,
    MISC_NODE_BEAST_CORE,
    MISC_NODE_BLINK_CORE,
    MISC_NODE_CHARGED_CORE,
} from '../../../../../researchTrees/trees/misc';
import {
    COMMAND_CORE_NODE_HEEL,
    COMMAND_CORE_NODE_SIC_EM,
    COMMAND_CORE_NODE_LOYAL_COMPANION,
    COMMAND_CORE_TREE_ID,
} from '../../../../../researchTrees/trees/command_core';

describe('seededShuffle', () => {
    it('returns the same order for the same seed', () => {
        const input = ['a', 'b', 'c', 'd', 'e'];
        const first = seededShuffle(input, 'player|choice|a,b,c,d,e');
        const second = seededShuffle(input, 'player|choice|a,b,c,d,e');
        expect(second).toEqual(first);
    });

    it('can produce a different order for a different seed', () => {
        const input = ['a', 'b', 'c', 'd', 'e'];
        const a = seededShuffle(input, 'seed-a');
        const b = seededShuffle(input, 'seed-b');
        // Extremely unlikely both seeds yield identical permutations of 5 items.
        expect(a).not.toEqual(b);
    });
});

describe('coreChoiceLabel', () => {
    it('prefixes The for titles that already name a core', () => {
        expect(coreChoiceLabel('Gravity', 'Gravity Core')).toBe('The Gravity Core');
    });

    it('uses the tree title when the node is not named a core', () => {
        expect(coreChoiceLabel('Earth', 'Craft Bone Claws')).toBe('The Earth Core');
        expect(coreChoiceLabel('Command Core', 'Loyal Companion')).toBe('The Command Core');
    });
});

describe('listTier10RootCoreCandidates', () => {
    it('only includes prereq-free nodes at the core awakening tier', () => {
        const candidates = listTier10RootCoreCandidates();
        expect(candidates.length).toBeGreaterThan(0);
        // Heel / Sic 'Em are tier 10 but have prereqs — must not appear.
        expect(candidates.some((c) => c.nodeId === COMMAND_CORE_NODE_HEEL)).toBe(false);
        expect(candidates.some((c) => c.nodeId === COMMAND_CORE_NODE_SIC_EM)).toBe(false);
        expect(
            candidates.some((c) => c.treeId === EARTH_TREE_ID && c.nodeId === EARTH_NODE_EARTH_CORE),
        ).toBe(true);
        expect(CORE_AWAKENING_TIER).toBe(10);
    });

    it('excludes draft cores from the candidate pool', () => {
        const candidates = listTier10RootCoreCandidates();
        expect(candidates.some((c) => c.nodeId === MISC_NODE_BLINK_CORE)).toBe(false);
        expect(candidates.some((c) => c.nodeId === MISC_NODE_BEAST_CORE)).toBe(false);
        expect(candidates.some((c) => c.nodeId === MISC_NODE_AIR_CORE)).toBe(false);
        expect(candidates.some((c) => c.nodeId === MISC_NODE_CHARGED_CORE)).toBe(false);
    });

    it('attaches target player IDs from CORE_TARGET_PLAYER_IDS', () => {
        const earth = listTier10RootCoreCandidates().find(
            (c) => c.treeId === EARTH_TREE_ID && c.nodeId === EARTH_NODE_EARTH_CORE,
        );
        expect(earth?.targetPlayerIds).toEqual(CORE_TARGET_PLAYER_IDS[`${EARTH_TREE_ID}+${EARTH_NODE_EARTH_CORE}`]);
    });
});

describe('pickCoreAwakeningOptions', () => {
    it('places for-you cores first and keeps them in the offer', () => {
        const candidates = listTier10RootCoreCandidates();
        const earthId = `${EARTH_TREE_ID}+${EARTH_NODE_EARTH_CORE}`;
        const picked = pickCoreAwakeningOptions(candidates, '9', 'seed-player-9');
        expect(picked[0]?.id).toBe(earthId);
        expect(picked.some((c) => c.id === earthId)).toBe(true);
        expect(picked.length).toBeLessThanOrEqual(CORE_AWAKENING_OPTION_COUNT);
    });

    it('sorts gravity for-you ahead of non-targeted cores for player 16', () => {
        const candidates = listTier10RootCoreCandidates();
        const gravityId = `${GRAVITY_TREE_ID}+${GRAVITY_NODE_CORE}`;
        const picked = pickCoreAwakeningOptions(candidates, '16', 'seed-player-16');
        expect(picked[0]?.id).toBe(gravityId);
    });
});

describe('CoreAwakeningMission.getPostMissionChoiceOptions', () => {
    const baseParams = {
        choiceId: 'core_awakening_reward',
        playerId: 'p1',
        equippedItemIds: [] as string[],
        playerResearchTrees: {} as Record<string, string[]>,
    };

    it('returns a stable option order across repeated calls (poll re-render simulation)', () => {
        const first = CORE_AWAKENING.getPostMissionChoiceOptions(baseParams);
        const second = CORE_AWAKENING.getPostMissionChoiceOptions({
            ...baseParams,
            // New array/object identities, same content — mirrors lobby poll props.
            equippedItemIds: [...baseParams.equippedItemIds],
            playerResearchTrees: { ...baseParams.playerResearchTrees },
        });

        expect(first).not.toBeNull();
        expect(second).toEqual(first);
        expect(first!.length).toBeGreaterThan(0);
        expect(first!.length).toBeLessThanOrEqual(CORE_AWAKENING_OPTION_COUNT);
    });

    it('marks forYou and sorts targeted cores first for the matching player', () => {
        const result = CORE_AWAKENING.getPostMissionChoiceOptions({
            ...baseParams,
            playerId: '8',
        });
        expect(result).not.toBeNull();
        const commandId = `${COMMAND_CORE_TREE_ID}+${COMMAND_CORE_NODE_LOYAL_COMPANION}`;
        expect(result![0]?.id).toBe(commandId);
        expect(result![0]?.forYou).toBe(true);
        expect(result!.filter((r) => r.forYou).every((r) => r.id === commandId)).toBe(true);
        // Non-targeted rows should not claim forYou.
        expect(result!.slice(1).every((r) => !r.forYou)).toBe(true);
    });

    it('returns null when the player already owns a core', () => {
        const result = CORE_AWAKENING.getPostMissionChoiceOptions({
            ...baseParams,
            playerResearchTrees: {
                [EARTH_TREE_ID]: [EARTH_NODE_EARTH_CORE],
            },
        });
        expect(result).toBeNull();
    });
});
