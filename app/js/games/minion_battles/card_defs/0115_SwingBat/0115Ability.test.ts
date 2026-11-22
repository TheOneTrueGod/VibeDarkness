import { describe, expect, it } from 'vitest';
// Load AbilityRegistry before ability modules so CastBehaviours finishes exporting
// before ThrowRock's module body calls CastBehaviours.ProjectileLaunch().
import { getAbility } from '../../abilities/AbilityRegistry';
import {
    TRAINING_MIGHTY_DAMAGE_MULT_AT_MAX,
    TRAINING_MIGHTY_LEVELS,
    TRAINING_NODE_MIGHTY,
    TRAINING_TREE_ID,
} from '../../../../researchTrees/trees/training';
import { NODE_TRAINING_REGIME, WEAPONS_TREE_ID } from '../../../../researchTrees/trees/weaponTreeIds';
import { DescriptiveValue, getApproxIntegerIncrease } from '../../../../researchTrees/descriptiveValue';
import { SWING_BAT_BASE_DAMAGE, SwingBatAbility_0115 } from './0115Ability';

void getAbility;

const MIGHTY_ONE_LEVEL = 1;
const MIGHTY_ONE_LEVEL_MULT =
    1 + ((TRAINING_MIGHTY_DAMAGE_MULT_AT_MAX - 1) * MIGHTY_ONE_LEVEL) / TRAINING_MIGHTY_LEVELS;
const PIPE_BAT_DAMAGE_BONUS = getApproxIntegerIncrease(SWING_BAT_BASE_DAMAGE, DescriptiveValue.Medium);
const PIPE_BAT_BASE = SWING_BAT_BASE_DAMAGE + PIPE_BAT_DAMAGE_BONUS;

describe('Swing Mace getTooltipText (damage tokens)', () => {
    it('without context shows base damage', () => {
        const lines = SwingBatAbility_0115.getTooltipText();
        expect(lines.some((l) => l.includes(`{${SWING_BAT_BASE_DAMAGE}}`))).toBe(true);
        expect(lines.some((l) => l.includes(`{${Math.round(SWING_BAT_BASE_DAMAGE * MIGHTY_ONE_LEVEL_MULT)}}`))).toBe(false);
        expect(lines.some((l) => l.includes('{Knockback 3}'))).toBe(true);
    });

    it('Mighty mult on base damage shows the boosted dynamic value', () => {
        const gameState = {
            getLocalPlayerUnit: () => ({
                getDamageModifier: () => ({ flatAmt: 0, multiplier: MIGHTY_ONE_LEVEL_MULT }),
                stackSize: 1,
            }),
        };
        const lines = SwingBatAbility_0115.getTooltipText(gameState);
        expect(lines.some((l) => l.includes(`{${Math.round(SWING_BAT_BASE_DAMAGE * MIGHTY_ONE_LEVEL_MULT)}}`))).toBe(true);
        expect(lines.some((l) => l.includes(`{${SWING_BAT_BASE_DAMAGE}}`))).toBe(false);
    });

    it('research bag applies pipe-bat base then Mighty on the boosted base', () => {
        const mightyOnPipeBat = Math.round(PIPE_BAT_BASE * MIGHTY_ONE_LEVEL_MULT);
        const lines = SwingBatAbility_0115.getTooltipText({
            researchTrees: {
                [WEAPONS_TREE_ID]: [NODE_TRAINING_REGIME],
                [TRAINING_TREE_ID]: [TRAINING_NODE_MIGHTY],
            },
            researchNodeLevels: { [TRAINING_TREE_ID]: { [TRAINING_NODE_MIGHTY]: MIGHTY_ONE_LEVEL } },
        });
        expect(lines.some((l) => l.includes(`{${mightyOnPipeBat}}`))).toBe(true);
        expect(lines.some((l) => l.includes(`{${SWING_BAT_BASE_DAMAGE}}`))).toBe(false);
    });
});
