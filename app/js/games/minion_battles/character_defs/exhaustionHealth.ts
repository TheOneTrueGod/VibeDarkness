import { DEFAULT_CHARACTER_ENDURANCE } from './characterEndurance';

/**
 * Available health-pool fraction at 100% exhaustion (exhaustion === endurance).
 * 0% exhaustion keeps the full pool.
 */
export const EXHAUSTION_MIN_AVAILABLE_HEALTH_FRACTION = 0.3;

/** Fraction of max HP reserved at 100% exhaustion. */
export const EXHAUSTION_HEALTH_LOSS_FRACTION = 1 - EXHAUSTION_MIN_AVAILABLE_HEALTH_FRACTION;

/** Solid gray used for the reserved exhaustion slice on health bars (Tailwind gray-500). */
export const EXHAUSTION_HEALTH_BAR_FILL = 0x6b7280;

export const EXHAUSTION_HEALTH_BAR_TOOLTIP =
    'Exhaustion - Start fights with less health due to previous injuries';

export function getExhaustionRatio(exhaustion: number, endurance: number): number {
    if (!Number.isFinite(exhaustion) || exhaustion <= 0) {
        return 0;
    }
    const cap = Number.isFinite(endurance) && endurance > 0 ? endurance : DEFAULT_CHARACTER_ENDURANCE;
    return Math.max(0, Math.min(1, exhaustion / cap));
}

/** HP reserved from the pool at fight start (gray bar slice). Does not mutate maxHp. */
export function computeExhaustionReservedHp(
    maxHp: number,
    exhaustion: number,
    endurance: number,
): number {
    if (!Number.isFinite(maxHp) || maxHp <= 0) {
        return 0;
    }
    return maxHp * getExhaustionRatio(exhaustion, endurance) * EXHAUSTION_HEALTH_LOSS_FRACTION;
}

export function applyFightStartExhaustion(
    unit: { maxHp: number; hp: number; hpExhaustion: number },
    exhaustion: number,
    endurance: number,
): void {
    unit.hpExhaustion = computeExhaustionReservedHp(unit.maxHp, exhaustion, endurance);
    unit.hp = Math.min(unit.hp, unit.maxHp - unit.hpExhaustion);
}
