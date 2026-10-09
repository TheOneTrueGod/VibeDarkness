import { describe, expect, it } from 'vitest';
import {
    CAMPSITE,
    CAMPSITE_CHOICE_ID,
    CAMPSITE_EXHAUSTION_RECOVERY,
    CAMPSITE_INTRO_TEXT,
    CAMPSITE_RESEARCH_OPTION_COUNT,
    CAMPSITE_RESEARCH_SLOTS,
} from './campsite';
import { MISSION_MAP } from '../../index';
import { resolveResearchRewardSlots } from '../../researchRewardSlots';
import { RESEARCH_TREES, getResearchTree } from '../../../../../researchTrees/list';
import { getResearchNodeTags } from '../../../../../researchTrees/types';
import { LIGHT_NODE_CORE, LIGHT_TREE_ID } from '../../../../../researchTrees/trees/light';
import { STICK_SWORD_NODE_BASE, STICK_SWORD_TREE_ID } from '../../../../../researchTrees/trees/stick_sword';
import { TRAINING_NODE_CORE, TRAINING_TREE_ID } from '../../../../../researchTrees/trees/training';
import { CORE_ITEM_IDS } from '../../../character_defs/items';

/** A player who is in a weapon tree, the stat tree and a core tree. */
const RESEARCHED = {
    [LIGHT_TREE_ID]: [LIGHT_NODE_CORE],
    [STICK_SWORD_TREE_ID]: [STICK_SWORD_NODE_BASE],
    [TRAINING_TREE_ID]: [TRAINING_NODE_CORE],
};
// Stick (002) is equipped so the stored stick_sword research is part of the player's active research.
const EQUIPMENT = [CORE_ITEM_IDS.LightCore, '002'];

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

    it('opens with a single intro line, then recovers 20 exhaustion, then offers research slots', () => {
        const phrases = CAMPSITE.postMissionStory!.phrases;
        expect(phrases[0]).toMatchObject({ type: 'dialogue', text: 'You have discovered a campsite' });
        expect(CAMPSITE_INTRO_TEXT).toBe('You have discovered a campsite');
        expect(phrases[1]).toEqual({ type: 'recover_exhaustion_auto', amount: 20 });
        expect(CAMPSITE_EXHAUSTION_RECOVERY).toBe(20);
        expect(phrases[2]).toMatchObject({
            type: 'choice',
            choiceId: CAMPSITE_CHOICE_ID,
            researchRewardSlots: CAMPSITE_RESEARCH_SLOTS,
        });
        expect(phrases).toHaveLength(3);
    });

    it('lays slots out so the grid shows weapon (left), stat (middle), core (right), two rows deep', () => {
        // The choice grid fills row-major across 3 columns: columns are index % 3.
        expect(CAMPSITE_RESEARCH_OPTION_COUNT).toBe(6);
        expect(CAMPSITE_RESEARCH_SLOTS.map((s) => (s as { tag?: string }).tag)).toEqual([
            'weapon', 'stat', 'core', 'weapon', 'stat', 'core',
        ]);
        for (const slot of CAMPSITE_RESEARCH_SLOTS) expect((slot as { random?: boolean }).random).toBe(true);
    });

    it('offers two distinct upgrades of each type, deterministically', () => {
        const rows = offer('p1');
        expect(rows).toHaveLength(6);
        const keys = rows.map((r) => JSON.stringify(r.action));
        expect(new Set(keys).size).toBe(6);
        const expected = ['weapon', 'stat', 'core', 'weapon', 'stat', 'core'];
        rows.forEach((row, i) => {
            expect(row.disabledLabel).toBeUndefined();
            expect(tagsOf(row)).toContain(expected[i]);
        });
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

    it('offers nothing selectable for a fresh character', () => {
        const rows = resolveResearchRewardSlots(CAMPSITE_RESEARCH_SLOTS, {}, [], 'p1');
        expect(rows).toHaveLength(6);
        for (const row of rows) expect(row.disabledLabel).toBeDefined();
    });
});
