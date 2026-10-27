import { describe, expect, it } from 'vitest';
import { TOWARDS_THE_LIGHT } from './002_towards_the_light';
import { resolveResearchRewardSlots } from '../../researchRewardSlots';
import { resolveUnlockedTierItemIds } from '../../unlockItemTiers';
import { getActiveResearchTrees } from '../../../../../researchTrees/activeResearch';
import { getItemDef } from '../../../character_defs/items';
import { STORY_BACKGROUNDS } from '../../../assets/story';

const choice = TOWARDS_THE_LIGHT.postMissionStory?.phrases.find(
    (p) => p.type === 'choice' && p.choiceId === 'towards_the_light_cave_choice',
);
if (!choice || choice.type !== 'choice') throw new Error('choice phrase missing');

describe('Towards the Light equipment choice', () => {
    it('offers Charged Rocks, Throwing Knives, Sword and Mace as fixed equip options', () => {
        expect(choice.options.map((o) => o.action)).toEqual([
            { type: 'equip_item', itemId: '011' },
            { type: 'equip_item', itemId: '012' },
            { type: 'equip_item', itemId: '013' },
            { type: 'equip_item', itemId: '014' },
        ]);
        expect(choice.researchRewardSlots).toBeUndefined();
    });

    it('only offers tier-2 weapons', () => {
        for (const option of choice.options) {
            if (option.action.type !== 'equip_item') throw new Error('expected equip_item');
            const def = getItemDef(option.action.itemId)!;
            expect(def.tier).toBe(2);
            expect(def.slots).toContain('weapon');
        }
    });

    it('uses the whisky cave background', () => {
        expect(choice.backgroundImage).toBe(STORY_BACKGROUNDS.whiskyCave);
    });

    it('unlocks every tier-2 weapon and the tier-3 Charged Shield on victory', () => {
        expect(
            resolveUnlockedTierItemIds(TOWARDS_THE_LIGHT.completionRewards?.unlockItemTiers, TOWARDS_THE_LIGHT.campaignId),
        ).toEqual(['011', '012', '013', '014', '015', '016']);
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
