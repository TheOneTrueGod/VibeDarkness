import { describe, expect, it } from 'vitest';
import { TOWARDS_THE_LIGHT } from './002_towards_the_light';
import { resolveResearchRewardSlots } from '../../researchRewardSlots';
import { resolveUnlockedTierItemIds } from '../../unlockItemTiers';
import { getActiveResearchTrees } from '../../../../../researchTrees/activeResearch';

const choice = TOWARDS_THE_LIGHT.postMissionStory?.phrases.find(
    (p) => p.type === 'choice' && p.choiceId === 'towards_the_light_cave_choice',
);
if (!choice || choice.type !== 'choice') throw new Error('choice phrase missing');
const slots = choice.researchRewardSlots ?? [];

function offeredItemIds(equipped: string[]): string[] {
    return resolveResearchRewardSlots(slots, {}, equipped)
        .map((row) => (row.action.type === 'equip_item' ? row.action.itemId : undefined))
        .filter((id): id is string => id !== undefined);
}

describe('Towards the Light equipment choice', () => {
    it('uses two equipmentUpgrade slots', () => {
        expect(slots).toEqual([
            { kind: 'equipmentUpgrade', slot: 'weapon' },
            { kind: 'equipmentUpgrade', slot: 'weapon' },
        ]);
    });

    it('offers a Rocks player Charged Rocks and Knives', () => {
        expect(offeredItemIds(['004', '001'])).toEqual(['011', '012']);
    });

    it('offers a Stick player Sword and Mace', () => {
        expect(offeredItemIds(['004', '002'])).toEqual(['013', '014']);
    });

    it('offers a Shield player only Crystal Shield', () => {
        const rows = resolveResearchRewardSlots(slots, {}, ['004', '003']);
        expect(rows).toHaveLength(1);
        expect(rows[0].action).toEqual({ type: 'equip_item', itemId: '015' });
    });

    it('unlocks every tier-2 weapon on victory', () => {
        expect(
            resolveUnlockedTierItemIds(TOWARDS_THE_LIGHT.completionRewards?.unlockItemTiers, TOWARDS_THE_LIGHT.campaignId),
        ).toEqual(['011', '012', '013', '014', '015']);
    });

    it('random weapon slots only offer the equipped item trees', () => {
        const rows = resolveResearchRewardSlots([{ tag: 'weapon', random: true }], {}, ['004', '011']);
        for (const row of rows) {
            if (row.action.type !== 'grant_research_to_player' || row.disabledLabel) continue;
            const active = Object.keys(getActiveResearchTrees({}, ['004', '011']));
            expect(active).toContain(row.action.treeId);
        }
    });
});
