import { describe, it, expect } from 'vitest';
import { pickTurnIndicatorPropsAfterUnfreeze } from './turnIndicatorPresentation';

describe('pickTurnIndicatorPropsAfterUnfreeze', () => {
    it('prefers live ally_turn over a mid-freeze your_turn stash (lobby 03FABA)', () => {
        // Failure mode: rewind freeze stashed mark-restore your_turn; order apply then set
        // ally_turn in the same React commit as unfreeze. Applying the stash left the plaque
        // on "Your Turn" while canUseOrderUi was already false (cards greyed).
        const live = pickTurnIndicatorPropsAfterUnfreeze({
            liveState: 'ally_turn',
            liveAllyName: 'Guest',
        });
        expect(live).toEqual({ state: 'ally_turn', allyName: 'Guest' });
        // A stash of your_turn must not be consulted — live props are the only input.
        expect(live.state).not.toBe('your_turn');
    });

    it('passes through live your_turn when that is still authoritative', () => {
        expect(
            pickTurnIndicatorPropsAfterUnfreeze({
                liveState: 'your_turn',
                liveAllyName: 'Guest',
            }),
        ).toEqual({ state: 'your_turn', allyName: 'Guest' });
    });
});
