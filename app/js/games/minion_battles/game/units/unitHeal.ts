import type { Unit } from './Unit';

/** Default fraction of a heal banked as permanent (this-battle) hpInjury. */
export const DEFAULT_HEAL_PENALTY_PCT = 0.3;

/** Effective max HP can never be pushed below this fraction of the unit's real maxHp. */
export const MIN_EFFECTIVE_MAX_HP_PCT = 0.5;

/**
 * Apply a heal to a unit. Banks `penaltyPct` of the amount actually healed as hpInjury,
 * which lowers getEffectiveMaxHp() without ever mutating the real maxHp field.
 * The only place hp should increase from healing anywhere in the codebase.
 * Returns the actual amount healed (after clamping to the pre-heal effective max).
 */
export function applyHeal(unit: Unit, amount: number, penaltyPct: number = DEFAULT_HEAL_PENALTY_PCT): number {
    if (amount <= 0 || !unit.isAlive()) return 0;
    const effectiveMaxBefore = unit.getEffectiveMaxHp();
    const actualHeal = Math.max(0, Math.min(amount, effectiveMaxBefore - unit.hp));
    if (actualHeal <= 0) return 0;

    unit.hp += actualHeal;
    const injuryAdded = actualHeal * penaltyPct;
    unit.hpInjury = Math.min(unit.maxHp * (1 - MIN_EFFECTIVE_MAX_HP_PCT), unit.hpInjury + injuryAdded);
    unit.hp = Math.min(unit.hp, unit.getEffectiveMaxHp());
    return actualHeal;
}
