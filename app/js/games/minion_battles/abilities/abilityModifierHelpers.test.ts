import { describe, expect, it } from 'vitest';
import {
    TRAINING_MIGHTY_ALL_DAMAGE_MULT,
    TRAINING_MIGHTY_LEVELS,
    TRAINING_NODE_CORE,
    TRAINING_NODE_MIGHTY,
    TRAINING_TREE_ID,
} from '../../../researchTrees/trees/training';
import { RESEARCH_DAMAGE_BONUSES } from '../research/researchTrainingEffects';
import { resolveTooltipContext } from './abilityModifierHelpers';
import type { Unit } from '../game/units/Unit';

const MIGHTY_TWO_LEVELS = 2;
const MIGHTY_TWO_LEVEL_MULT =
    1 +
    ((TRAINING_MIGHTY_ALL_DAMAGE_MULT - 1) * MIGHTY_TWO_LEVELS) / TRAINING_MIGHTY_LEVELS;

describe('resolveTooltipContext', () => {
    it('prefers local player unit as attacker over research bag', () => {
        const attacker = { id: 'u1' } as unknown as Unit;
        const gameState = {
            getLocalPlayerUnit: () => attacker,
            researchTrees: { [TRAINING_TREE_ID]: [TRAINING_NODE_MIGHTY] },
        };
        const ctx = resolveTooltipContext(gameState);
        expect(ctx.attacker).toBe(attacker);
        expect(ctx.damageModifier).toBeUndefined();
    });

    it('builds damageModifier from character-select research bag', () => {
        const gameState = {
            researchTrees: {
                [TRAINING_TREE_ID]: [TRAINING_NODE_CORE, TRAINING_NODE_MIGHTY],
            },
            researchNodeLevels: {
                [TRAINING_TREE_ID]: { [TRAINING_NODE_MIGHTY]: MIGHTY_TWO_LEVELS },
            },
        };
        const ctx = resolveTooltipContext(gameState);
        expect(ctx.attacker).toBeUndefined();
        expect(ctx.damageModifier).toEqual({
            flatAmt: RESEARCH_DAMAGE_BONUSES[TRAINING_NODE_CORE],
            multiplier: MIGHTY_TWO_LEVEL_MULT,
        });
    });

    it('opts.researchTrees override / supply research when gameState empty', () => {
        const trees = { [TRAINING_TREE_ID]: [TRAINING_NODE_MIGHTY] };
        const levels = { [TRAINING_TREE_ID]: { [TRAINING_NODE_MIGHTY]: MIGHTY_TWO_LEVELS } };
        const ctx = resolveTooltipContext(undefined, {
            researchTrees: trees,
            researchNodeLevels: levels,
            ability: { id: '0302', damageModifierMultiplier: 1 },
        });
        expect(ctx.damageModifier?.multiplier).toBe(MIGHTY_TWO_LEVEL_MULT);
        expect(ctx.abilityId).toBe('0302');
        expect(ctx.abilityFlatScale).toBe(1);
    });

    it('empty context when no unit and no research', () => {
        expect(resolveTooltipContext(undefined)).toEqual({});
        expect(resolveTooltipContext({})).toEqual({});
    });
});
