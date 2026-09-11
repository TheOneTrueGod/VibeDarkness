import type { CampaignResourceCost } from './types';

/** Core-tree campaign totals at the low and high display tiers. Variety around these is expected. */
export const CORE_RESEARCH_TIER_LOW = 10;
export const CORE_RESEARCH_TIER_HIGH = 15;
export const CORE_RESEARCH_TIER_LOW_TOTAL = 20;
export const CORE_RESEARCH_TIER_HIGH_TOTAL = 30;
export const CORE_RESEARCH_TOTAL_SLACK = 3;

export const CORE_RESEARCH_TIER_LOW_MIN_CRYSTALS = 10;
export const CORE_RESEARCH_TIER_HIGH_MIN_CRYSTALS = 15;
export const CORE_RESEARCH_MIN_FOOD = 5;

export function researchResourceTotal(cost: CampaignResourceCost): number {
    return (cost.crystals ?? 0) + (cost.food ?? 0) + (cost.metal ?? 0);
}

/** Linear target between the tier-10 and tier-15 totals. Tiers below 10 stay at the low total. */
export function interpolatedCoreResearchTotal(tier: number): number {
    if (tier <= CORE_RESEARCH_TIER_LOW) return CORE_RESEARCH_TIER_LOW_TOTAL;
    if (tier >= CORE_RESEARCH_TIER_HIGH) return CORE_RESEARCH_TIER_HIGH_TOTAL;
    const span = CORE_RESEARCH_TIER_HIGH - CORE_RESEARCH_TIER_LOW;
    const progress = (tier - CORE_RESEARCH_TIER_LOW) / span;
    return CORE_RESEARCH_TIER_LOW_TOTAL
        + progress * (CORE_RESEARCH_TIER_HIGH_TOTAL - CORE_RESEARCH_TIER_LOW_TOTAL);
}

export function minCoreResearchCrystals(tier: number): number {
    if (tier >= CORE_RESEARCH_TIER_HIGH) return CORE_RESEARCH_TIER_HIGH_MIN_CRYSTALS;
    if (tier >= CORE_RESEARCH_TIER_LOW) return CORE_RESEARCH_TIER_LOW_MIN_CRYSTALS;
    return 0;
}

export function minCoreResearchFood(tier: number): number {
    return tier >= CORE_RESEARCH_TIER_LOW ? CORE_RESEARCH_MIN_FOOD : 0;
}

/** Amounts above the crystal/food floors — used to check each tree's remaining-resource lean. */
export function remainingAfterCoreFloors(
    cost: CampaignResourceCost,
    tier: number,
): { crystals: number; food: number; metal: number } {
    return {
        crystals: Math.max(0, (cost.crystals ?? 0) - minCoreResearchCrystals(tier)),
        food: Math.max(0, (cost.food ?? 0) - minCoreResearchFood(tier)),
        metal: cost.metal ?? 0,
    };
}
