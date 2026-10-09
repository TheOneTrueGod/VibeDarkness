import { describe, expect, it } from 'vitest';
import { DARK_AWAKENING } from './001_dark_awakening';

describe('A Dark Awakening weapon choice', () => {
    const choice = DARK_AWAKENING.preMissionStory?.phrases.find(
        (p) => p.type === 'choice' && p.choiceId === 'dark_awakening_weapon',
    );

    it('offers equip_item actions for Rocks, Stick and Pot lid, with no research grant', () => {
        expect(choice).toBeDefined();
        if (!choice || choice.type !== 'choice') throw new Error('choice phrase missing');
        const byId = Object.fromEntries(choice.options.map((o) => [o.id, o.action]));
        expect(byId.rocks).toEqual({ type: 'equip_item', itemId: '001' });
        expect(byId.torch).toEqual({ type: 'equip_item', itemId: '002' });
        expect(byId.pot_shield).toEqual({ type: 'equip_item', itemId: '003' });
        for (const option of choice.options) {
            expect(option.action).not.toHaveProperty('alsoGrantResearch');
        }
    });
});
