import { describe, expect, it } from 'vitest';
import { getQuestDef, listQuestsForCampaign, QUEST_MAP } from './questRegistry';
import type { MissionSlotSpec, QuestDef } from './questTypes';
import { FIND_THE_HERD_OF_BOARS } from './WorldOfDarkness/quests/find_the_herd_of_boars';

describe('QUEST_MAP / registry', () => {
    it('returns the World of Darkness example quest', () => {
        const def = getQuestDef(FIND_THE_HERD_OF_BOARS.id);
        expect(def).toBeDefined();
        expect(def).toEqual(FIND_THE_HERD_OF_BOARS);
        expect(QUEST_MAP[FIND_THE_HERD_OF_BOARS.id]).toBe(FIND_THE_HERD_OF_BOARS);
    });

    it('listQuestsForCampaign includes the example for world_of_darkness', () => {
        const list = listQuestsForCampaign('world_of_darkness');
        expect(list.some((q) => q.id === FIND_THE_HERD_OF_BOARS.id)).toBe(true);
        expect(listQuestsForCampaign('no_such_campaign')).toEqual([]);
    });
});

describe('MissionSlotSpec narrowing', () => {
    it('narrows fixed slots to missionId', () => {
        const slot: MissionSlotSpec = FIND_THE_HERD_OF_BOARS.slots[0]!;
        expect(slot.kind).toBe('fixed');
        if (slot.kind === 'fixed') {
            expect(typeof slot.missionId).toBe('string');
            expect(slot.missionId.length).toBeGreaterThan(0);
        }
    });

    it('example quest uses only fixed slots', () => {
        for (const slot of FIND_THE_HERD_OF_BOARS.slots) {
            expect(slot.kind).toBe('fixed');
            if (slot.kind === 'fixed') {
                expect(slot.missionId).toBeTruthy();
            }
        }
        expect(FIND_THE_HERD_OF_BOARS.slots.length).toBeGreaterThanOrEqual(2);
        expect(FIND_THE_HERD_OF_BOARS.slots.length).toBeLessThanOrEqual(4);
    });

    it('discriminates random_battle vs random_story params', () => {
        const battle: MissionSlotSpec = {
            kind: 'random_battle',
            params: { biome: 'forest', challengeRating: 1 },
        };
        const story: MissionSlotSpec = {
            kind: 'random_story',
            params: { outcomeBias: 'neutral', tags: ['placeholder'] },
        };
        expect(battle.kind).toBe('random_battle');
        if (battle.kind === 'random_battle') {
            expect(battle.params.biome).toBe('forest');
        }
        expect(story.kind).toBe('random_story');
        if (story.kind === 'random_story') {
            expect(story.params.outcomeBias).toBe('neutral');
        }
    });
});

describe('QuestDef shape smoke', () => {
    it('example satisfies QuestDef fields used by the registry', () => {
        const q: QuestDef = FIND_THE_HERD_OF_BOARS;
        expect(q.campaignId).toBe('world_of_darkness');
        expect(q.title).toBe('Find the herd of boars');
        expect(Array.isArray(q.slots)).toBe(true);
    });
});
