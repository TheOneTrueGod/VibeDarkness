import type { Unit } from './Unit';
import type { EventBus } from '../EventBus';

/** Where a heal reports itself. With it, the heal fires `unit_healed` (green number, fingerprint). */
export interface HealFeedback {
    eventBus: EventBus;
    sourceUnitId?: string | null;
}

/** Default fraction of a heal banked as permanent (this-battle) hpInjury. */
export const DEFAULT_HEAL_PENALTY_PCT = 0.3;

/** Effective max HP can never be pushed below this fraction of the unit's real maxHp. */
export const MIN_EFFECTIVE_MAX_HP_PCT = 0.5;

/**
 * Apply a heal to a unit. Banks `penaltyPct` of the amount actually healed as hpInjury,
 * which lowers getEffectiveMaxHp() without ever mutating the real maxHp field.
 * The only place hp should increase from healing anywhere in the codebase.
 * Returns the actual amount healed (after clamping to the pre-heal effective max).
 * Pass `feedback` so the heal shows a green number; continuous drips leave it out.
 */
export function applyHeal(
    unit: Unit,
    amount: number,
    penaltyPct: number = DEFAULT_HEAL_PENALTY_PCT,
    feedback?: HealFeedback,
): number {
    if (amount <= 0 || !unit.isAlive()) return 0;
    const effectiveMaxBefore = unit.getEffectiveMaxHp();
    const actualHeal = Math.max(0, Math.min(amount, effectiveMaxBefore - unit.hp));
    if (actualHeal <= 0) return 0;

    unit.hp += actualHeal;
    const injuryAdded = actualHeal * penaltyPct;
    const pool = Math.max(0, unit.maxHp);
    unit.hpInjury = Math.min(pool * (1 - MIN_EFFECTIVE_MAX_HP_PCT), unit.hpInjury + injuryAdded);
    unit.hp = Math.min(unit.hp, unit.getEffectiveMaxHp());
    feedback?.eventBus.emit('unit_healed', {
        unitId: unit.id,
        amount: actualHeal,
        sourceUnitId: feedback.sourceUnitId ?? null,
    });
    return actualHeal;
}
