import { describe, expect, it } from 'vitest';
import { DARK_AWAKENING } from './001_dark_awakening';
import { resolveUnlockedTierItemIds } from '../../unlockItemTiers';

describe('A Dark Awakening weapon choice', () => {
    const choice = DARK_AWAKENING.preMissionStory?.phrases.find(
        (p) => p.type === 'choice' && p.choiceId === 'dark_awakening_weapon',
    );

    it('offers equip_item actions for Rocks and Stick only, with no research grant', () => {
        expect(choice).toBeDefined();
        if (!choice || choice.type !== 'choice') throw new Error('choice phrase missing');
        const byId = Object.fromEntries(choice.options.map((o) => [o.id, o.action]));
        expect(byId).toEqual({
            rocks: { type: 'equip_item', itemId: '001' },
            torch: { type: 'equip_item', itemId: '002' },
        });
        for (const option of choice.options) {
            expect(option.action).not.toHaveProperty('alsoGrantResearch');
        }
    });

    it('unlocks every tier-1 weapon on victory', () => {
        expect(DARK_AWAKENING.completionRewards?.unlockItemTiers).toEqual([{ slot: 'weapon', tier: 1 }]);
        expect(resolveUnlockedTierItemIds(DARK_AWAKENING.completionRewards?.unlockItemTiers, DARK_AWAKENING.campaignId)).toEqual([
            '001',
            '002',
            '003',
        ]);
    });
});
