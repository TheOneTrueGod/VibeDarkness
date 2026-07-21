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
import {
    STICK_SWORD_NODE_PIPE_BAT_DAMAGE,
    STICK_SWORD_TREE_ID,
} from '../../../../researchTrees/trees/stick_sword';
import { DescriptiveValue, getApproxIntegerIncrease } from '../../../../researchTrees/descriptiveValue';
import { SWING_BAT_BASE_DAMAGE, SwingBatAbility_0115 } from './0115Ability';

void getAbility;

const MIGHTY_TWO_LEVELS = 2;
const MIGHTY_TWO_LEVEL_MULT =
    1 + ((TRAINING_MIGHTY_ALL_DAMAGE_MULT - 1) * MIGHTY_TWO_LEVELS) / TRAINING_MIGHTY_LEVELS;
const PIPE_BAT_DAMAGE_BONUS = getApproxIntegerIncrease(SWING_BAT_BASE_DAMAGE, DescriptiveValue.Medium);
const PIPE_BAT_BASE = SWING_BAT_BASE_DAMAGE + PIPE_BAT_DAMAGE_BONUS;

describe('Swing Bat getTooltipText (damage tokens)', () => {
    it('without context shows base damage', () => {
        const lines = SwingBatAbility_0115.getTooltipText();
        expect(lines.some((l) => l.includes(`{${SWING_BAT_BASE_DAMAGE}}`))).toBe(true);
        expect(lines.some((l) => l.includes('{14}'))).toBe(false);
        expect(lines.some((l) => l.includes('{knockback 3}'))).toBe(true);
    });

    it('Mighty mult 1.4 on base 10 shows dynamic {14}', () => {
        const gameState = {
            getLocalPlayerUnit: () => ({
                getDamageModifier: () => ({ flatAmt: 0, multiplier: MIGHTY_TWO_LEVEL_MULT }),
                stackSize: 1,
            }),
        };
        const lines = SwingBatAbility_0115.getTooltipText(gameState);
        expect(lines.some((l) => l.includes('{14}'))).toBe(true);
        expect(lines.some((l) => l.includes(`{${SWING_BAT_BASE_DAMAGE}}`))).toBe(false);
    });

    it('research bag applies pipe-bat base then Mighty on the boosted base', () => {
        const mightyOnPipeBat = Math.round(PIPE_BAT_BASE * MIGHTY_TWO_LEVEL_MULT);
        const lines = SwingBatAbility_0115.getTooltipText({
            researchTrees: {
                [STICK_SWORD_TREE_ID]: [STICK_SWORD_NODE_PIPE_BAT_DAMAGE],
                [TRAINING_TREE_ID]: [TRAINING_NODE_MIGHTY],
            },
            researchNodeLevels: { [TRAINING_TREE_ID]: { [TRAINING_NODE_MIGHTY]: MIGHTY_TWO_LEVELS } },
        });
        expect(lines.some((l) => l.includes(`{${mightyOnPipeBat}}`))).toBe(true);
        expect(lines.some((l) => l.includes(`{${SWING_BAT_BASE_DAMAGE}}`))).toBe(false);
    });
});
