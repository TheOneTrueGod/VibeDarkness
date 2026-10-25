import { MISSION_BONUS_RESOURCE_KEYS } from '../campaignResources';
import type { CampaignResourceCost } from './types';

/** Core-tree campaign totals at the low and high display tiers. Variety around these is expected. */
export const CORE_RESEARCH_TIER_LOW = 10;
export const CORE_RESEARCH_TIER_HIGH = 15;
export const CORE_RESEARCH_TIER_LOW_TOTAL = 20;
export const CORE_RESEARCH_TIER_HIGH_TOTAL = 30;
export const CORE_RESEARCH_TOTAL_SLACK = 3;

export const CORE_RESEARCH_TIER_LOW_MIN_ATTUNEMENT = 10;
export const CORE_RESEARCH_TIER_HIGH_MIN_ATTUNEMENT = 15;
export const CORE_RESEARCH_MIN_VIGOR = 5;

export function researchResourceTotal(cost: CampaignResourceCost): number {
    return MISSION_BONUS_RESOURCE_KEYS.reduce((sum, key) => sum + (cost[key] ?? 0), 0);
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

export function minCoreResearchAttunement(tier: number): number {
    if (tier >= CORE_RESEARCH_TIER_HIGH) return CORE_RESEARCH_TIER_HIGH_MIN_ATTUNEMENT;
    if (tier >= CORE_RESEARCH_TIER_LOW) return CORE_RESEARCH_TIER_LOW_MIN_ATTUNEMENT;
    return 0;
}

export function minCoreResearchVigor(tier: number): number {
    return tier >= CORE_RESEARCH_TIER_LOW ? CORE_RESEARCH_MIN_VIGOR : 0;
}

/** Amounts above the attunement/vigor floors — used to check each tree's remaining-resource lean. */
export function remainingAfterCoreFloors(
    cost: CampaignResourceCost,
    tier: number,
): { attunement: number; vigor: number; metal: number } {
    return {
        attunement: Math.max(0, (cost.attunement ?? 0) - minCoreResearchAttunement(tier)),
        vigor: Math.max(0, (cost.vigor ?? 0) - minCoreResearchVigor(tier)),
        metal: cost.metal ?? 0,
    };
}
