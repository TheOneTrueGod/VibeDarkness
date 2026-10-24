import { describe, expect, it } from 'vitest';
import { storyChoiceActionResourceDelta } from './storyChoiceOptions';

describe('storyChoiceActionResourceDelta', () => {
    it('shows recover_hunger as a positive Hunger change', () => {
        expect(storyChoiceActionResourceDelta({ type: 'recover_hunger', amount: 10 })).toEqual({ hunger: 10 });
    });

    it('passes grant_resources amounts through', () => {
        expect(storyChoiceActionResourceDelta({ type: 'grant_resources', food: 5, metal: 2 })).toEqual({
            food: 5,
            metal: 2,
            crystals: undefined,
        });
    });

    it('is empty for actions without a resource reward', () => {
        expect(storyChoiceActionResourceDelta({ type: 'heal_wounds', amount: 3 })).toEqual({});
        expect(storyChoiceActionResourceDelta(undefined)).toEqual({});
    });
});
