/**
 * Quest slot bank unlock / eligibility / join-fill / mission gate tests.
 */

import { describe, expect, it } from 'vitest';
import type { MissionResult } from '../../../types';
import {
    countQuestBankClears,
    getEligibleQuestsForBank,
    getOptionalEligibleQuests,
    getQuestBankVictorySlots,
    getUnlockedMissionIds,
    getUnlockedQuestSlotBanks,
    isQuestBankRequiredClearsSatisfied,
    isQuestSlotBankUnlocked,
    listQuestVictoryResults,
    placeQuestResultOnMap,
    questMatchesFilters,
    bankAcceptsQuest,
    isDedicatedQuestBank,
} from './unlock';
import type { QuestDef, QuestResult, QuestSlotBank } from './questTypes';
import type { StorylineDef } from './types';
import {
    WOD_EXAMPLE_QUEST_BANK,
    WOD_EXAMPLE_QUEST_BANK_ID,
    WOD_EXAMPLE_QUEST_BANK_REQUIRED_CLEARS,
    WOD_FIND_THE_HERD_OF_BOARS_BANK,
    WOD_SCAVENGE_THE_PLAINS_BANK,
    WorldOfDarknessStoryline,
} from './WorldOfDarkness/WorldOfDarkness';
import { FIND_THE_HERD_OF_BOARS } from './WorldOfDarkness/quests/find_the_herd_of_boars';
import { SCAVENGE_THE_PLAINS } from './WorldOfDarkness/quests/scavenge_the_plains';
import {
    WOD_CH2_MAP_X_COL0,
    WOD_CH2_MAP_X_COL1,
    WOD_CH2_MAP_Y_ROW0,
    WOD_CH2_MAP_Y_ROW1,
} from './WorldOfDarkness/chapter2Map';

const CAMPAIGN_ID = 'world_of_darkness';

const OTHER_PLACEHOLDER_QUEST: QuestDef = {
    id: 'other_placeholder_quest',
    title: 'Other placeholder',
    campaignId: CAMPAIGN_ID,
    tags: ['placeholder'],
    slots: [{ kind: 'fixed', missionId: 'dark_awakening' }],
};

const NON_MATCHING_QUEST: QuestDef = {
    id: 'story_only_quest',
    title: 'Story only',
    campaignId: CAMPAIGN_ID,
    tags: ['story'],
    slots: [{ kind: 'fixed', missionId: 'dark_awakening' }],
};

const REGION_QUEST: QuestDef = {
    id: 'region_quest',
    title: 'Region quest',
    campaignId: CAMPAIGN_ID,
    tags: ['placeholder'],
    regionIds: ['north'],
    slots: [{ kind: 'fixed', missionId: 'dark_awakening' }],
};

function victoryMission(missionId: string): MissionResult {
    return { missionId, result: 'victory' };
}

function bankVictory(questDefId: string, bankId: string): QuestResult {
    return {
        questDefId,
        result: 'victory',
        placement: 'bank',
        bankId,
    };
}

describe('WorldOfDarkness post–Core Awakening quest bank', () => {
    it('is attached to the storyline as a side-quest picker with requiredClears = 1', () => {
        expect(WorldOfDarknessStoryline.questSlotBanks).toEqual([
            WOD_FIND_THE_HERD_OF_BOARS_BANK,
            WOD_SCAVENGE_THE_PLAINS_BANK,
            WOD_EXAMPLE_QUEST_BANK,
        ]);
        expect(WOD_EXAMPLE_QUEST_BANK.requiredClears).toBe(WOD_EXAMPLE_QUEST_BANK_REQUIRED_CLEARS);
        expect(WOD_EXAMPLE_QUEST_BANK_REQUIRED_CLEARS).toBe(1);
        expect(WOD_EXAMPLE_QUEST_BANK.isSideQuest).toBe(true);
        expect(WOD_EXAMPLE_QUEST_BANK.unlockAfterMissionId).toBe('core_awakening');
        expect(WOD_EXAMPLE_QUEST_BANK.questDefId).toBeUndefined();
        expect(WOD_EXAMPLE_QUEST_BANK.mapPosition).toEqual({
            x: WOD_CH2_MAP_X_COL0,
            y: WOD_CH2_MAP_Y_ROW1,
        });
    });

    it('pins Find the herd of boars and Scavenge the Plains as dedicated top-row nodes', () => {
        expect(isDedicatedQuestBank(WOD_FIND_THE_HERD_OF_BOARS_BANK)).toBe(true);
        expect(WOD_FIND_THE_HERD_OF_BOARS_BANK.questDefId).toBe(FIND_THE_HERD_OF_BOARS.id);
        expect(WOD_FIND_THE_HERD_OF_BOARS_BANK.mapPosition).toEqual({
            x: WOD_CH2_MAP_X_COL0,
            y: WOD_CH2_MAP_Y_ROW0,
        });
        expect(isDedicatedQuestBank(WOD_SCAVENGE_THE_PLAINS_BANK)).toBe(true);
        expect(WOD_SCAVENGE_THE_PLAINS_BANK.questDefId).toBe(SCAVENGE_THE_PLAINS.id);
        expect(WOD_SCAVENGE_THE_PLAINS_BANK.mapPosition).toEqual({
            x: WOD_CH2_MAP_X_COL1,
            y: WOD_CH2_MAP_Y_ROW0,
        });
        expect(WOD_EXAMPLE_QUEST_BANK.filters.excludeQuestDefIds).toEqual([
            FIND_THE_HERD_OF_BOARS.id,
            SCAVENGE_THE_PLAINS.id,
        ]);
    });

    it('unlocks only after core_awakening victory', () => {
        expect(isQuestSlotBankUnlocked(WOD_EXAMPLE_QUEST_BANK, [])).toBe(false);
        expect(
            isQuestSlotBankUnlocked(WOD_EXAMPLE_QUEST_BANK, [victoryMission('monster')]),
        ).toBe(false);
        expect(
            isQuestSlotBankUnlocked(WOD_EXAMPLE_QUEST_BANK, [victoryMission('core_awakening')]),
        ).toBe(true);
        expect(
            getUnlockedQuestSlotBanks(WorldOfDarknessStoryline, [victoryMission('core_awakening')]),
        ).toEqual([
            WOD_FIND_THE_HERD_OF_BOARS_BANK,
            WOD_SCAVENGE_THE_PLAINS_BANK,
            WOD_EXAMPLE_QUEST_BANK,
        ]);
    });
});

describe('dedicated quest banks', () => {
    const pool = [FIND_THE_HERD_OF_BOARS, SCAVENGE_THE_PLAINS, OTHER_PLACEHOLDER_QUEST];

    it('accepts only the pinned quest', () => {
        expect(bankAcceptsQuest(WOD_FIND_THE_HERD_OF_BOARS_BANK, FIND_THE_HERD_OF_BOARS)).toBe(true);
        expect(bankAcceptsQuest(WOD_FIND_THE_HERD_OF_BOARS_BANK, SCAVENGE_THE_PLAINS)).toBe(false);
        expect(bankAcceptsQuest(WOD_SCAVENGE_THE_PLAINS_BANK, SCAVENGE_THE_PLAINS)).toBe(true);
        expect(bankAcceptsQuest(WOD_SCAVENGE_THE_PLAINS_BANK, FIND_THE_HERD_OF_BOARS)).toBe(false);
    });

    it('lists only the pinned uncleared quest as eligible', () => {
        expect(
            getEligibleQuestsForBank(
                WOD_FIND_THE_HERD_OF_BOARS_BANK,
                CAMPAIGN_ID,
                [],
                pool,
            ).map((q) => q.id),
        ).toEqual([FIND_THE_HERD_OF_BOARS.id]);
        expect(
            getEligibleQuestsForBank(
                WOD_SCAVENGE_THE_PLAINS_BANK,
                CAMPAIGN_ID,
                [],
                pool,
            ).map((q) => q.id),
        ).toEqual([SCAVENGE_THE_PLAINS.id]);
    });

    it('join-fills the dedicated bank before the Surface Quests picker', () => {
        const placement = placeQuestResultOnMap(
            { questDefId: FIND_THE_HERD_OF_BOARS.id, result: 'victory' },
            [
                WOD_FIND_THE_HERD_OF_BOARS_BANK,
                WOD_SCAVENGE_THE_PLAINS_BANK,
                WOD_EXAMPLE_QUEST_BANK,
            ],
            [],
            FIND_THE_HERD_OF_BOARS,
        );
        expect(placement).toEqual({
            placement: 'bank',
            bankId: WOD_FIND_THE_HERD_OF_BOARS_BANK.id,
        });
    });
});

describe('questMatchesFilters', () => {
    it('requires all filter tags and respects excludeQuestDefIds', () => {
        expect(questMatchesFilters(FIND_THE_HERD_OF_BOARS, { tags: ['placeholder'] })).toBe(true);
        expect(questMatchesFilters(FIND_THE_HERD_OF_BOARS, { tags: ['placeholder', 'missing'] })).toBe(
            false,
        );
        expect(
            questMatchesFilters(FIND_THE_HERD_OF_BOARS, {
                tags: ['placeholder'],
                excludeQuestDefIds: [FIND_THE_HERD_OF_BOARS.id],
            }),
        ).toBe(false);
    });

    it('requires overlapping regionIds when filter lists regions', () => {
        expect(questMatchesFilters(REGION_QUEST, { regionIds: ['north'] })).toBe(true);
        expect(questMatchesFilters(REGION_QUEST, { regionIds: ['south'] })).toBe(false);
        expect(questMatchesFilters(FIND_THE_HERD_OF_BOARS, { regionIds: ['north'] })).toBe(false);
    });
});

describe('getOptionalEligibleQuests / victory helpers', () => {
    const pool = [FIND_THE_HERD_OF_BOARS, OTHER_PLACEHOLDER_QUEST, NON_MATCHING_QUEST];

    it('lists uncleared campaign quests for the optional/side outlet', () => {
        const optional = getOptionalEligibleQuests(CAMPAIGN_ID, [], pool);
        expect(optional.map((q) => q.id).sort()).toEqual(
            [FIND_THE_HERD_OF_BOARS.id, OTHER_PLACEHOLDER_QUEST.id, NON_MATCHING_QUEST.id].sort(),
        );
    });

    it('excludes victory-cleared quests from optional list', () => {
        const optional = getOptionalEligibleQuests(
            CAMPAIGN_ID,
            [{ questDefId: FIND_THE_HERD_OF_BOARS.id, result: 'victory', placement: 'optional' }],
            pool,
        );
        expect(optional.map((q) => q.id).sort()).toEqual(
            [OTHER_PLACEHOLDER_QUEST.id, NON_MATCHING_QUEST.id].sort(),
        );
    });

    it('lists bank victory slots and victory results for map markers', () => {
        const bank = WOD_EXAMPLE_QUEST_BANK;
        const results = [
            bankVictory(FIND_THE_HERD_OF_BOARS.id, bank.id),
            {
                questDefId: NON_MATCHING_QUEST.id,
                result: 'victory' as const,
                placement: 'optional' as const,
            },
        ];
        expect(getQuestBankVictorySlots(bank, results).map((r) => r.questDefId)).toEqual([
            FIND_THE_HERD_OF_BOARS.id,
        ]);
        expect(listQuestVictoryResults(results).map((r) => r.questDefId).sort()).toEqual(
            [FIND_THE_HERD_OF_BOARS.id, NON_MATCHING_QUEST.id].sort(),
        );
    });
});

describe('getEligibleQuestsForBank / requiredClears', () => {
    const bank: QuestSlotBank = {
        id: 'test_bank',
        requiredClears: 2,
        filters: { tags: ['placeholder'] },
    };
    const pool = [FIND_THE_HERD_OF_BOARS, OTHER_PLACEHOLDER_QUEST, NON_MATCHING_QUEST];

    it('lists filter-matching uncleared quests only', () => {
        const eligible = getEligibleQuestsForBank(bank, CAMPAIGN_ID, [], pool);
        expect(eligible.map((q) => q.id).sort()).toEqual(
            [FIND_THE_HERD_OF_BOARS.id, OTHER_PLACEHOLDER_QUEST.id].sort(),
        );
    });

    it('excludes already victory-cleared quests', () => {
        const eligible = getEligibleQuestsForBank(
            bank,
            CAMPAIGN_ID,
            [{ questDefId: FIND_THE_HERD_OF_BOARS.id, result: 'victory', placement: 'optional' }],
            pool,
        );
        expect(eligible.map((q) => q.id)).toEqual([OTHER_PLACEHOLDER_QUEST.id]);
    });

    it('requiredClears satisfied only after enough bank placements', () => {
        expect(isQuestBankRequiredClearsSatisfied(bank, [])).toBe(false);
        expect(
            isQuestBankRequiredClearsSatisfied(bank, [
                bankVictory(FIND_THE_HERD_OF_BOARS.id, bank.id),
            ]),
        ).toBe(false);
        expect(
            countQuestBankClears(bank, [
                bankVictory(FIND_THE_HERD_OF_BOARS.id, bank.id),
                bankVictory(OTHER_PLACEHOLDER_QUEST.id, bank.id),
            ]),
        ).toBe(2);
        expect(
            isQuestBankRequiredClearsSatisfied(bank, [
                bankVictory(FIND_THE_HERD_OF_BOARS.id, bank.id),
                bankVictory(OTHER_PLACEHOLDER_QUEST.id, bank.id),
            ]),
        ).toBe(true);
        // Optional placements do not count toward the bank.
        expect(
            isQuestBankRequiredClearsSatisfied(bank, [
                {
                    questDefId: FIND_THE_HERD_OF_BOARS.id,
                    result: 'victory',
                    placement: 'optional',
                },
                {
                    questDefId: OTHER_PLACEHOLDER_QUEST.id,
                    result: 'victory',
                    placement: 'optional',
                },
            ]),
        ).toBe(false);
    });
});

describe('placeQuestResultOnMap (join-fill)', () => {
    const bankA: QuestSlotBank = {
        id: 'bank_a',
        requiredClears: 1,
        filters: { tags: ['placeholder'] },
    };
    const bankB: QuestSlotBank = {
        id: 'bank_b',
        requiredClears: 2,
        filters: { tags: ['placeholder'] },
    };

    it('places into the first open matching bank', () => {
        const placement = placeQuestResultOnMap(
            { questDefId: FIND_THE_HERD_OF_BOARS.id, result: 'victory' },
            [bankA, bankB],
            [],
            FIND_THE_HERD_OF_BOARS,
        );
        expect(placement).toEqual({ placement: 'bank', bankId: bankA.id });
    });

    it('spills to optional when matching banks are full', () => {
        const existing = [bankVictory('already_filled', bankA.id)];
        const placement = placeQuestResultOnMap(
            { questDefId: FIND_THE_HERD_OF_BOARS.id, result: 'victory' },
            [bankA],
            existing,
            FIND_THE_HERD_OF_BOARS,
        );
        expect(placement).toEqual({ placement: 'optional' });
    });

    it('spills to optional when filters do not match', () => {
        const placement = placeQuestResultOnMap(
            { questDefId: NON_MATCHING_QUEST.id, result: 'victory' },
            [bankA],
            [],
            NON_MATCHING_QUEST,
        );
        expect(placement).toEqual({ placement: 'optional' });
    });

    it('keeps prior victory placement on re-clear', () => {
        const existing: QuestResult[] = [
            {
                questDefId: FIND_THE_HERD_OF_BOARS.id,
                result: 'victory',
                placement: 'bank',
                bankId: WOD_EXAMPLE_QUEST_BANK_ID,
            },
        ];
        const placement = placeQuestResultOnMap(
            { questDefId: FIND_THE_HERD_OF_BOARS.id, result: 'victory' },
            [bankA],
            existing,
            FIND_THE_HERD_OF_BOARS,
        );
        expect(placement).toEqual({
            placement: 'bank',
            bankId: WOD_EXAMPLE_QUEST_BANK_ID,
        });
    });

    it('fills bank_b when bank_a is full', () => {
        const existing = [bankVictory('filled_a', bankA.id)];
        const placement = placeQuestResultOnMap(
            { questDefId: OTHER_PLACEHOLDER_QUEST.id, result: 'victory' },
            [bankA, bankB],
            existing,
            OTHER_PLACEHOLDER_QUEST,
        );
        expect(placement).toEqual({ placement: 'bank', bankId: bankB.id });
    });
});

describe('mission gated by quest bank (requiresQuestBankId)', () => {
    const gatedStoryline: StorylineDef = {
        id: 'gated_test',
        title: 'Gated',
        startMissionId: 'm1',
        edges: [
            { fromMissionId: 'm1', result: 'victory', toMissionId: 'm2' },
            {
                fromMissionId: 'm2',
                result: 'victory',
                toMissionId: 'm3',
                requiresQuestBankId: 'gate_bank',
            },
        ],
        questSlotBanks: [
            {
                id: 'gate_bank',
                unlockAfterMissionId: 'm2',
                requiredClears: 2,
                filters: { tags: ['placeholder'] },
            },
        ],
    };

    it('does not unlock gated mission until requiredClears are met', () => {
        const missionResults: MissionResult[] = [
            victoryMission('m1'),
            victoryMission('m2'),
        ];
        expect(getUnlockedMissionIds(gatedStoryline, missionResults, [])).toEqual(
            new Set(['m1', 'm2']),
        );
        expect(
            getUnlockedMissionIds(gatedStoryline, missionResults, [
                bankVictory('q1', 'gate_bank'),
            ]),
        ).toEqual(new Set(['m1', 'm2']));
        expect(
            getUnlockedMissionIds(gatedStoryline, missionResults, [
                bankVictory('q1', 'gate_bank'),
                bankVictory('q2', 'gate_bank'),
            ]),
        ).toEqual(new Set(['m1', 'm2', 'm3']));
    });
});
