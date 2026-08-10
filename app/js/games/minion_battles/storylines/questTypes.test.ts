import { describe, expect, it } from 'vitest';
import { getQuestDef, listQuestsForCampaign, QUEST_MAP } from './questRegistry';
import type { MissionSlotSpec, QuestDef } from './questTypes';
import { FIND_THE_HERD_OF_BOARS } from './WorldOfDarkness/quests/find_the_herd_of_boars';
import { SCAVENGE_THE_PLAINS } from './WorldOfDarkness/quests/scavenge_the_plains';

describe('QUEST_MAP / registry', () => {
    it('returns the World of Darkness fixture and Scavenge the Plains quests', () => {
        expect(getQuestDef(FIND_THE_HERD_OF_BOARS.id)).toEqual(FIND_THE_HERD_OF_BOARS);
        expect(getQuestDef(SCAVENGE_THE_PLAINS.id)).toEqual(SCAVENGE_THE_PLAINS);
        expect(QUEST_MAP[SCAVENGE_THE_PLAINS.id]).toBe(SCAVENGE_THE_PLAINS);
    });

    it('listQuestsForCampaign includes Scavenge the Plains for world_of_darkness', () => {
        const list = listQuestsForCampaign('world_of_darkness');
        expect(list.some((q) => q.id === SCAVENGE_THE_PLAINS.id)).toBe(true);
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

    it('example quest mixes fixed and random_story slots', () => {
        expect(FIND_THE_HERD_OF_BOARS.slots[0]?.kind).toBe('fixed');
        expect(FIND_THE_HERD_OF_BOARS.slots[1]?.kind).toBe('random_story');
        expect(FIND_THE_HERD_OF_BOARS.slots[2]?.kind).toBe('fixed');
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
