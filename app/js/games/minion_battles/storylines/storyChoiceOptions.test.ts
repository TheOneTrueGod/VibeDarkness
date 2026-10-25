import { describe, expect, it } from 'vitest';
import { storyChoiceActionResourceDelta } from './storyChoiceOptions';

describe('storyChoiceActionResourceDelta', () => {
    it('shows recover_hunger as a positive Hunger change', () => {
        expect(storyChoiceActionResourceDelta({ type: 'recover_hunger', amount: 10 })).toEqual({ hunger: 10 });
    });

    it('passes grant_resources amounts through', () => {
        expect(storyChoiceActionResourceDelta({ type: 'grant_resources', vigor: 5, metal: 2 })).toEqual({
            vigor: 5,
            metal: 2,
            attunement: undefined,
        });
    });

    it('is empty for actions without a resource reward', () => {
        expect(storyChoiceActionResourceDelta({ type: 'heal_wounds', amount: 3 })).toEqual({});
        expect(storyChoiceActionResourceDelta(undefined)).toEqual({});
    });
});
