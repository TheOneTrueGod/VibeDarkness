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
        const rows = getCampsiteResearchChoiceRows({}, [], 'p1');
        expect(rows).toHaveLength(CAMPSITE_RESEARCH_OPTION_COUNT);
        const keys = rows.map((r) => JSON.stringify(r.action));
        expect(new Set(keys).size).toBe(rows.length);
        for (const row of rows) expect(row.action.type).toBe('grant_research_to_player');
        expect(getCampsiteResearchChoiceRows({}, [], 'p1')).toEqual(rows);
    });

    it('resolves choice options through the mission hook', () => {
        const rows = CAMPSITE.getPostMissionChoiceOptions({
            choiceId: CAMPSITE_CHOICE_ID,
            equippedItemIds: [],
            playerResearchTrees: {},
            playerId: 'p1',
        });
        expect(rows).toEqual(getCampsiteResearchChoiceRows({}, [], 'p1'));
    });
});
