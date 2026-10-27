import { describe, expect, it } from 'vitest';
import { LIGHT_EMPOWERED, LIGHT_EMPOWERED_HUNGER_RECOVERY } from './003_light_empowered';
import { applyOrderedHungerChanges } from '../../matchHunger';
import { resolveUnlockedTierItemIds } from '../../unlockItemTiers';
import { KNOWLEDGE_RESOURCE_FOOD } from '../../../../../accountKnowledge';

describe('Find some food hunger recovery', () => {
    it('ends the post-mission story by recovering 100 Hunger', () => {
        expect(LIGHT_EMPOWERED_HUNGER_RECOVERY).toBe(100);
        const phrases = LIGHT_EMPOWERED.postMissionStory!.phrases;
        expect(phrases[phrases.length - 1]).toEqual({
            type: 'recover_hunger_auto',
            amount: LIGHT_EMPOWERED_HUNGER_RECOVERY,
        });
    });

    it('fills a new character from 30% to full', () => {
        expect(applyOrderedHungerChanges(30, [-10, LIGHT_EMPOWERED_HUNGER_RECOVERY], 100)).toBe(100);
    });
});

describe('Find some food rewards', () => {
    it('unlocks the tier-3 weapon (Charged Shield)', () => {
        expect(
            resolveUnlockedTierItemIds(LIGHT_EMPOWERED.completionRewards?.unlockItemTiers, LIGHT_EMPOWERED.campaignId),
        ).toEqual(['016']);
    });

    it('grants knowledge of food', () => {
        expect(LIGHT_EMPOWERED.completionRewards?.knowledgeKeys).toContain(KNOWLEDGE_RESOURCE_FOOD);
    });
});
