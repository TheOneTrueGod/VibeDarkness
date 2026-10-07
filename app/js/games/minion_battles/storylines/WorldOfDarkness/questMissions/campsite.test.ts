import { describe, expect, it } from 'vitest';
import {
    CAMPSITE,
    CAMPSITE_CHOICE_ID,
    CAMPSITE_EXHAUSTION_RECOVERY,
    CAMPSITE_INTRO_TEXT,
    CAMPSITE_RESEARCH_OPTION_COUNT,
    getCampsiteResearchChoiceRows,
} from './campsite';
import { MISSION_MAP } from '../../index';
import { RESEARCH_TREES } from '../../../../../researchTrees/list';
import { LIGHT_NODE_CORE, LIGHT_TREE_ID } from '../../../../../researchTrees/trees/light';
import { CORE_ITEM_IDS } from '../../../character_defs/items';

const WITH_LIGHT_CORE = { [LIGHT_TREE_ID]: [LIGHT_NODE_CORE] };
const LIGHT_EQUIPMENT = [CORE_ITEM_IDS.LightCore];

describe('campsite mission', () => {
    it('is registered as a campsite-type, battle-less node', () => {
        expect(MISSION_MAP.campsite).toBe(CAMPSITE);
        expect(CAMPSITE.missionType).toBe('campsite');
        expect(CAMPSITE.skipBattle).toBe(true);
    });

    it('opens with a single intro line, then recovers 20 exhaustion, then offers research', () => {
        const phrases = CAMPSITE.postMissionStory!.phrases;
        expect(phrases[0]).toMatchObject({ type: 'dialogue', text: 'You have discovered a campsite' });
        expect(CAMPSITE_INTRO_TEXT).toBe('You have discovered a campsite');
        expect(phrases[1]).toEqual({ type: 'recover_exhaustion_auto', amount: 20 });
        expect(CAMPSITE_EXHAUSTION_RECOVERY).toBe(20);
        expect(phrases[2]).toMatchObject({ type: 'choice', choiceId: CAMPSITE_CHOICE_ID });
        expect(phrases).toHaveLength(3);
    });

    it('offers 3 distinct research grants, deterministically per player/state', () => {
        const rows = getCampsiteResearchChoiceRows(WITH_LIGHT_CORE, LIGHT_EQUIPMENT, 'p1');
        expect(rows).toHaveLength(CAMPSITE_RESEARCH_OPTION_COUNT);
        const keys = rows.map((r) => JSON.stringify(r.action));
        expect(new Set(keys).size).toBe(rows.length);
        for (const row of rows) expect(row.action.type).toBe('grant_research_to_player');
        expect(getCampsiteResearchChoiceRows(WITH_LIGHT_CORE, LIGHT_EQUIPMENT, 'p1')).toEqual(rows);
    });

    it('resolves choice options through the mission hook', () => {
        const rows = CAMPSITE.getPostMissionChoiceOptions({
            choiceId: CAMPSITE_CHOICE_ID,
            equippedItemIds: LIGHT_EQUIPMENT,
            playerResearchTrees: WITH_LIGHT_CORE,
            playerId: 'p1',
        });
        expect(rows).toEqual(getCampsiteResearchChoiceRows(WITH_LIGHT_CORE, LIGHT_EQUIPMENT, 'p1'));
    });

    it('never offers mission-reward-only nodes (e.g. alternative Cores) or nodes from locked trees', () => {
        const missionRewardOnly = new Set(
            RESEARCH_TREES.flatMap((t) =>
                t.nodes.filter((n) => n.requirements.some((r) => r.type === 'missionReward')).map((n) => `${t.id}:${n.id}`),
            ),
        );
        expect(missionRewardOnly.has('blood_mage:blood_mage_core')).toBe(true);
        for (let i = 0; i < 25; i++) {
            const rows = getCampsiteResearchChoiceRows(WITH_LIGHT_CORE, LIGHT_EQUIPMENT, `p${i}`);
            for (const row of rows) {
                const a = row.action as { treeId: string; nodeId: string };
                expect(missionRewardOnly.has(`${a.treeId}:${a.nodeId}`)).toBe(false);
                expect(a.treeId).toBe(LIGHT_TREE_ID);
            }
        }
    });

    it('offers nothing for a fresh character (no core nodes, no locked trees)', () => {
        expect(getCampsiteResearchChoiceRows({}, [], 'p1')).toEqual([]);
    });
});
