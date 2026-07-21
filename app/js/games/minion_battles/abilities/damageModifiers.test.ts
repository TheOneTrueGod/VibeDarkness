import { describe, expect, it, vi } from 'vitest';
import {
    applyDamageModifier,
    applyPassiveDamageBonuses,
    buildDamageModifierFromResearch,
    getAbilityDamageForDisplay,
    getModifiedAbilityDamage,
} from './damageModifiers';
import { DEFAULT_PASSIVE_MULT } from '../../../researchTrees/passiveBonuses';
import {
    TRAINING_MIGHTY_ALL_DAMAGE_MULT,
    TRAINING_MIGHTY_LEVELS,
    TRAINING_NODE_CORE,
    TRAINING_NODE_MIGHTY,
    TRAINING_TREE_ID,
} from '../../../researchTrees/trees/training';
import { RESEARCH_DAMAGE_BONUSES } from '../research/researchTrainingEffects';
import { formatTooltipNumber, resolveDamageToken } from './tooltipTokens';
import type { Unit } from '../game/units/Unit';

/** Mighty researched twice → all_damage mult 1.4 (plan: base 10 → 14). */
const MIGHTY_TWO_LEVELS = 2;
const MIGHTY_TWO_LEVEL_MULT =
    1 +
    ((TRAINING_MIGHTY_ALL_DAMAGE_MULT - 1) * MIGHTY_TWO_LEVELS) / TRAINING_MIGHTY_LEVELS;

describe('applyDamageModifier', () => {
    it('applies flat + mult + stackSize without rounding', () => {
        // (8 + 2) * 1.5 * 1 = 15
        expect(applyDamageModifier(8, { flatAmt: 2, multiplier: 1.5 }, 1)).toBe(15);
    });

    it('scales flat by abilityFlatScale', () => {
        // (10 + 6 * 0.5) * 1 = 13
        expect(applyDamageModifier(10, { flatAmt: 6, multiplier: 1 }, 1, 0.5)).toBe(13);
    });

    it('leaves fractional results (no combat Math.round)', () => {
        // (5 + 0) * 1.3 = 6.5
        expect(applyDamageModifier(5, { flatAmt: 0, multiplier: 1.3 })).toBe(6.5);
    });
});

describe('getModifiedAbilityDamage', () => {
    it('keeps base damage when attacker is missing', () => {
        expect(getModifiedAbilityDamage(undefined, 8)).toBe(8);
    });

    it('adds flat bonus when multiplier is 1', () => {
        const getDamageModifier = vi.fn(() => ({ flatAmt: 2, multiplier: 1 }));
        const attacker = { getDamageModifier, stackSize: 1 } as unknown as Unit;

        expect(getModifiedAbilityDamage(attacker, 8)).toBe(10);
        expect(getDamageModifier).toHaveBeenCalledOnce();
    });

    it('scales base plus flat by multiplier', () => {
        const getDamageModifier = vi.fn(() => ({ flatAmt: 2, multiplier: 1.5 }));
        const attacker = { getDamageModifier, stackSize: 1 } as unknown as Unit;

        // (8 + 2) * 1.5 = 15
        expect(getModifiedAbilityDamage(attacker, 8)).toBe(15);
    });

    it('matches Math.round(applyDamageModifier(...)) for Unit fixtures', () => {
        const modifier = { flatAmt: 2, multiplier: 1.3 };
        const getDamageModifier = vi.fn(() => modifier);
        const attacker = { getDamageModifier, stackSize: 2 } as unknown as Unit;
        const base = 7;
        const scale = 0.5;

        expect(getModifiedAbilityDamage(attacker, base, scale)).toBe(
            Math.round(applyDamageModifier(base, modifier, attacker.stackSize, scale)),
        );
    });
});

describe('getAbilityDamageForDisplay', () => {
    it('Mighty ×2 (mult 1.4) on base 10 → raw 14', () => {
        expect(
            getAbilityDamageForDisplay(10, {
                damageModifier: { flatAmt: 0, multiplier: MIGHTY_TWO_LEVEL_MULT },
            }),
        ).toBe(14);
        expect(formatTooltipNumber(14)).toBe('14');
    });

    it('flat + mult combo', () => {
        const modifier = { flatAmt: 2, multiplier: MIGHTY_TWO_LEVEL_MULT };
        expect(getAbilityDamageForDisplay(10, { damageModifier: modifier })).toBe(
            applyDamageModifier(10, modifier),
        );
        expect(applyDamageModifier(10, modifier)).toBeCloseTo(16.8, 10);
    });

    it('abilityFlatScale on flat', () => {
        // (10 + 4 * 0.5) * 1 = 12
        expect(
            getAbilityDamageForDisplay(10, {
                damageModifier: { flatAmt: 4, multiplier: 1 },
                abilityFlatScale: 0.5,
            }),
        ).toBe(12);
    });

    it('no-context returns base', () => {
        expect(getAbilityDamageForDisplay(10, {})).toBe(10);
    });

    it('prefers attacker over damageModifier', () => {
        const getDamageModifier = vi.fn(() => ({ flatAmt: 0, multiplier: MIGHTY_TWO_LEVEL_MULT }));
        const attacker = { getDamageModifier, stackSize: 1 } as unknown as Unit;
        expect(
            getAbilityDamageForDisplay(10, {
                attacker,
                damageModifier: { flatAmt: 99, multiplier: 9 },
            }),
        ).toBe(14);
    });
});

describe('buildDamageModifierFromResearch', () => {
    it('matches BaseMissionDef: Training flat + Mighty all_damage.mult', () => {
        const trees = {
            [TRAINING_TREE_ID]: [TRAINING_NODE_CORE, TRAINING_NODE_MIGHTY],
        };
        const levels = {
            [TRAINING_TREE_ID]: { [TRAINING_NODE_MIGHTY]: MIGHTY_TWO_LEVELS },
        };
        const mod = buildDamageModifierFromResearch(trees, levels);
        expect(mod.flatAmt).toBe(RESEARCH_DAMAGE_BONUSES[TRAINING_NODE_CORE]);
        expect(mod.multiplier).toBe(MIGHTY_TWO_LEVEL_MULT);
    });

    it('identity modifier when research empty', () => {
        expect(buildDamageModifierFromResearch(undefined)).toEqual({
            flatAmt: 0,
            multiplier: DEFAULT_PASSIVE_MULT,
        });
    });
});

describe('resolveDamageToken (wired to display helper)', () => {
    it('formats Mighty-boosted Burst base 10 as "14"', () => {
        expect(
            resolveDamageToken(10, {
                damageModifier: { flatAmt: 0, multiplier: MIGHTY_TWO_LEVEL_MULT },
            }),
        ).toBe('14');
    });

    it('sub-10 raw shows tenths (not combat integer round)', () => {
        // 5 * 1.3 = 6.5 → formatTooltipNumber → "6.5"
        expect(
            resolveDamageToken(5, { damageModifier: { flatAmt: 0, multiplier: 1.3 } }),
        ).toBe('6.5');
        // combat would Math.round(6.5) → 7
        expect(Math.round(applyDamageModifier(5, { flatAmt: 0, multiplier: 1.3 }))).toBe(7);
    });
});

describe('applyPassiveDamageBonuses', () => {
    it('returns base when caster is missing', () => {
        expect(applyPassiveDamageBonuses(8, undefined)).toBe(8);
    });

    it('applies all_damage mult from caster bag', () => {
        const caster = {
            passiveBonuses: { all_damage: { add: 0, mult: 2 } },
        } as unknown as Unit;
        expect(applyPassiveDamageBonuses(8, caster)).toBe(16);
    });

    it('uses default mult when bag lacks all_damage', () => {
        const caster = { passiveBonuses: {} } as unknown as Unit;
        expect(applyPassiveDamageBonuses(8, caster)).toBe(8);
        expect(DEFAULT_PASSIVE_MULT).toBe(1);
    });
});
