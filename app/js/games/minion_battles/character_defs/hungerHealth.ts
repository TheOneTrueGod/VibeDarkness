/** Hunger fraction below which fights start with reduced max health. */
export const HUNGER_LOW_THRESHOLD_FRACTION = 0.15;

export type HungerPenaltyTier = {
    /** Fraction of max Hunger this tier applies up to. */
    maxFraction: number;
    /** Whether `maxFraction` itself is inside the tier (`<=`) or just outside (`<`). */
    inclusive: boolean;
    /** Fraction of base max HP removed at fight start. */
    maxHpPenalty: number;
    label: string;
};

/** Most severe first; the first matching tier wins. Fractions at or above 15% have no penalty. */
export const HUNGER_PENALTY_TIERS: readonly HungerPenaltyTier[] = [
    { maxFraction: 0, inclusive: true, maxHpPenalty: 0.5, label: 'Starving' },
    { maxFraction: HUNGER_LOW_THRESHOLD_FRACTION, inclusive: false, maxHpPenalty: 0.25, label: 'Hungry' },
];

export const HUNGER_BAR_TOOLTIP =
    'Hunger: How well fed this character is.\n' +
    'Eat well to heal your wounds after a fight.\n' +
    '<15: Lose 25% max health\n' +
    '0: Lose 50% max health';

/** Tier that applies at this Hunger, or null when well fed. */
export function getHungerPenaltyTier(hunger: number, maxHunger: number): HungerPenaltyTier | null {
    const fraction =
        Number.isFinite(hunger) && Number.isFinite(maxHunger) && maxHunger > 0 ? hunger / maxHunger : 0;
    for (const tier of HUNGER_PENALTY_TIERS) {
        if (fraction < tier.maxFraction || (tier.inclusive && fraction <= tier.maxFraction)) {
            return tier;
        }
    }
    return null;
}

/** Fraction of max HP removed at fight start for this Hunger (0, 0.25 or 0.5). */
export function getHungerPenalty(hunger: number, maxHunger: number): number {
    return getHungerPenaltyTier(hunger, maxHunger)?.maxHpPenalty ?? 0;
}

/** In-battle line such as "Hungry: -25% max health" (with a true minus sign), or null when there is no penalty. */
export function describeHungerPenalty(penalty: number): string | null {
    const tier = HUNGER_PENALTY_TIERS.find((t) => t.maxHpPenalty === penalty);
    if (!tier) return null;
    return `${tier.label}: −${Math.round(tier.maxHpPenalty * 100)}% max health`;
}

/**
 * Lower a freshly built unit's maxHp (and set hp to it) according to the Hunger tier,
 * and record the applied penalty on `unit.hungerPenalty`.
 */
export function applyFightStartHunger(
    unit: { maxHp: number; hp: number; hungerPenalty: number },
    hunger: number,
    maxHunger: number,
): void {
    const penalty = getHungerPenalty(hunger, maxHunger);
    unit.hungerPenalty = penalty;
    if (penalty <= 0) {
        return;
    }
    unit.maxHp = Math.max(1, Math.round(unit.maxHp * (1 - penalty)));
    unit.hp = unit.maxHp;
}
