import { describe, expect, it } from 'vitest';
// Load AbilityRegistry before ability modules so CastBehaviours finishes exporting
// before ThrowRock's module body calls CastBehaviours.ProjectileLaunch().
import { getAbility } from '../../abilities/AbilityRegistry';
import {
    TRAINING_MIGHTY_ALL_DAMAGE_MULT,
    TRAINING_MIGHTY_LEVELS,
    TRAINING_NODE_MIGHTY,
    TRAINING_TREE_ID,
} from '../../../../researchTrees/trees/training';
import { SWING_STICK_DAMAGE, SwingStickAbility_0103 } from './0103Ability';

void getAbility;

const MIGHTY_TWO_LEVELS = 2;
const MIGHTY_TWO_LEVEL_MULT =
    1 + ((TRAINING_MIGHTY_ALL_DAMAGE_MULT - 1) * MIGHTY_TWO_LEVELS) / TRAINING_MIGHTY_LEVELS;

describe('Swing Stick getTooltipText (damage tokens)', () => {
    it('without context shows base damage', () => {
        const lines = SwingStickAbility_0103.getTooltipText();
        expect(lines.some((l) => l.includes(`{${SWING_STICK_DAMAGE}}`))).toBe(true);
        expect(lines.some((l) => l.includes('{14}'))).toBe(false);
        expect(lines.some((l) => l.includes('{knockback 1}'))).toBe(true);
    });

    it('Mighty mult 1.4 on base 10 shows dynamic {14}', () => {
        const gameState = {
            getLocalPlayerUnit: () => ({
                getDamageModifier: () => ({ flatAmt: 0, multiplier: MIGHTY_TWO_LEVEL_MULT }),
                stackSize: 1,
            }),
        };
        const lines = SwingStickAbility_0103.getTooltipText(gameState);
        expect(lines.some((l) => l.includes('{14}'))).toBe(true);
        expect(lines.some((l) => l.includes(`{${SWING_STICK_DAMAGE}}`))).toBe(false);
    });

    it('research bag (character select) resolves Mighty via resolveTooltipContext', () => {
        const lines = SwingStickAbility_0103.getTooltipText({
            researchTrees: { [TRAINING_TREE_ID]: [TRAINING_NODE_MIGHTY] },
            researchNodeLevels: { [TRAINING_TREE_ID]: { [TRAINING_NODE_MIGHTY]: MIGHTY_TWO_LEVELS } },
        });
        expect(lines.some((l) => l.includes('{14}'))).toBe(true);
        expect(lines.some((l) => l.includes(`{${SWING_STICK_DAMAGE}}`))).toBe(false);
    });
});
