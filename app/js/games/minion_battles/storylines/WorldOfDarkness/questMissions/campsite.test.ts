import { describe, expect, it } from 'vitest';
import {
    CAMPSITE,
    CAMPSITE_CHOICE_ID,
    CAMPSITE_CORE_PICKS,
    CAMPSITE_HUNGER_RECOVERY,
    CAMPSITE_INTRO_TEXT,
    CAMPSITE_RESEARCH_OPTION_COUNT,
    CAMPSITE_RESEARCH_SLOTS,
} from './campsite';
import { MISSION_MAP } from '../../index';
import { resolveResearchRewardSlots } from '../../researchRewardSlots';
import { RESEARCH_TREES, getResearchTree } from '../../../../../researchTrees/list';
import { getResearchNodeTags } from '../../../../../researchTrees/types';
import { LIGHT_NODE_CORE, LIGHT_TREE_ID } from '../../../../../researchTrees/trees/light';
import { WEAPONS_TREE_ID, WEAPON_ITEM_MACE } from '../../../../../researchTrees/trees/weaponTreeIds';
import { TRAINING_NODE_CORE, TRAINING_TREE_ID } from '../../../../../researchTrees/trees/training';
import { CORE_ITEM_IDS } from '../../../character_defs/items';

/** A player who is in a weapon tree, the stat tree and a core tree: only the core tree is offered. */
const RESEARCHED = {
    [LIGHT_TREE_ID]: [LIGHT_NODE_CORE],
    [WEAPONS_TREE_ID]: [],
    [TRAINING_TREE_ID]: [TRAINING_NODE_CORE],
};
// Mace (014) is equipped so its own upgrade (Training Regime) and the shared Iron Wrists are on offer.
const EQUIPMENT = [CORE_ITEM_IDS.LightCore, WEAPON_ITEM_MACE];

function offer(seed: string) {
    return resolveResearchRewardSlots(CAMPSITE_RESEARCH_SLOTS, RESEARCHED, EQUIPMENT, seed);
}

function tagsOf(row: { action: unknown }): string[] {
    const a = row.action as { treeId: string; nodeId: string };
    const tree = getResearchTree(a.treeId)!;
    return getResearchNodeTags(tree, tree.nodes.find((n) => n.id === a.nodeId)!);
}

describe('campsite mission', () => {
    it('is registered as a campsite-type, battle-less node', () => {
        expect(MISSION_MAP.campsite).toBe(CAMPSITE);
        expect(CAMPSITE.missionType).toBe('campsite');
        expect(CAMPSITE.skipBattle).toBe(true);
    });

    it('opens with a single intro line, then recovers 20 Hunger, then offers research slots', () => {
        const phrases = CAMPSITE.postMissionStory!.phrases;
        expect(phrases[0]).toMatchObject({ type: 'dialogue', text: 'You have discovered a campsite' });
        expect(CAMPSITE_INTRO_TEXT).toBe('You have discovered a campsite');
        expect(phrases[1]).toEqual({ type: 'recover_hunger_auto', amount: 20 });
        expect(CAMPSITE_HUNGER_RECOVERY).toBe(20);
        expect(phrases[2]).toMatchObject({
            type: 'choice',
            choiceId: CAMPSITE_CHOICE_ID,
            researchRewardSlots: CAMPSITE_RESEARCH_SLOTS,
        });
        expect(phrases).toHaveLength(3);
    });

    it('only has random core slots, which drop out when nothing is left', () => {
        expect(CAMPSITE_RESEARCH_OPTION_COUNT).toBe(CAMPSITE_CORE_PICKS);
        for (const slot of CAMPSITE_RESEARCH_SLOTS) {
            expect(slot).toEqual({ tag: 'core', random: true, omitWhenUnavailable: true });
        }
    });

    it('offers distinct core upgrades only, with no weapon or stat research, deterministically', () => {
        const rows = offer('p1');
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.length).toBeLessThanOrEqual(CAMPSITE_CORE_PICKS);
        expect(new Set(rows.map((r) => JSON.stringify(r.action))).size).toBe(rows.length);
        for (const row of rows) {
            expect(row.disabledLabel).toBeUndefined();
            expect(tagsOf(row)).toContain('core');
        }
        expect(offer('p1')).toEqual(rows);
    });

    it('never offers mission-reward-only nodes (e.g. alternative Cores)', () => {
        const missionRewardOnly = new Set(
            RESEARCH_TREES.flatMap((t) =>
                t.nodes.filter((n) => n.requirements.some((r) => r.type === 'missionReward')).map((n) => `${t.id}:${n.id}`),
            ),
        );
        expect(missionRewardOnly.has('blood_mage:blood_mage_core')).toBe(true);
        for (let i = 0; i < 25; i++) {
            for (const row of offer(`p${i}`)) {
                const a = row.action as { treeId: string; nodeId: string };
                expect(missionRewardOnly.has(`${a.treeId}:${a.nodeId}`)).toBe(false);
            }
        }
    });

    it('offers nothing to a fresh character, rather than disabled placeholders', () => {
        expect(resolveResearchRewardSlots(CAMPSITE_RESEARCH_SLOTS, {}, [], 'p1')).toEqual([]);
    });
});
