/**
 * Campaign API field defaults for Darkness Upgrades persistence.
 * Mirrors `Campaign::toArray` / `fromArray` unknown-safe defaults (empty research maps).
 */

import { EMPTY_DARKNESS_UPGRADES, type CampaignState, type DarknessUpgradesState } from '../types';

/** Fresh copy of the empty state (avoids sharing mutable maps between campaigns). */
function emptyDarknessUpgrades(): DarknessUpgradesState {
    return {
        researchTrees: { ...EMPTY_DARKNESS_UPGRADES.researchTrees },
        researchNodeLevels: { ...EMPTY_DARKNESS_UPGRADES.researchNodeLevels },
        researchNodeSources: { ...EMPTY_DARKNESS_UPGRADES.researchNodeSources },
    };
}

/**
 * Apply API-stable defaults for Darkness Upgrades campaign fields.
 * Legacy saves without the key get `EMPTY_DARKNESS_UPGRADES`; partially-missing sub-maps are filled.
 */
export function withDarknessUpgradesDefaults<T extends { darknessUpgrades?: DarknessUpgradesState }>(
    campaign: T,
): T & { darknessUpgrades: DarknessUpgradesState } {
    const existing = campaign.darknessUpgrades;
    if (!existing) {
        return { ...campaign, darknessUpgrades: emptyDarknessUpgrades() };
    }
    return {
        ...campaign,
        darknessUpgrades: {
            researchTrees: existing.researchTrees ?? {},
            researchNodeLevels: existing.researchNodeLevels ?? {},
            researchNodeSources: existing.researchNodeSources ?? {},
        },
    };
}

/** Keys the PATCH `/api/campaigns/:id` body may include for Darkness Upgrades persistence. */
export const DARKNESS_UPGRADES_PATCH_KEYS = [
    'darknessUpgrades',
] as const satisfies readonly (keyof CampaignState)[];
