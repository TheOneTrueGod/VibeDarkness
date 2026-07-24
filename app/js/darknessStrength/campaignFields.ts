/**
 * Campaign API field defaults for DarknessStrength persistence.
 * Mirrors `Campaign::toArray` / `fromArray` unknown-safe defaults (`[]` / `{}`).
 */

import type { CampaignRegionState, CampaignState } from '../types';
import type { DarknessStrengthAdminOverride, DarknessStrengthInstance } from './types';

/** Default when campaign JSON omits instances (legacy saves). */
export const DEFAULT_DARKNESS_STRENGTH_INSTANCES: DarknessStrengthInstance[] = [];

/** Default when campaign JSON omits admin overrides. */
export const DEFAULT_ADMIN_DARKNESS_STRENGTH_OVERRIDES: Record<
    string,
    DarknessStrengthAdminOverride
> = {};

/** Default when campaign JSON omits regions stub. */
export const DEFAULT_CAMPAIGN_REGIONS: Record<string, CampaignRegionState> = {};

/**
 * Apply API-stable defaults for DarknessStrength campaign fields.
 * Use when reading a campaign payload that may predate these keys.
 */
export function withCampaignDarknessStrengthDefaults(
    campaign: Omit<CampaignState, 'darknessStrengthInstances'> & {
        darknessStrengthInstances?: DarknessStrengthInstance[];
    },
): CampaignState {
    return {
        ...campaign,
        darknessStrengthInstances:
            campaign.darknessStrengthInstances ?? DEFAULT_DARKNESS_STRENGTH_INSTANCES,
        adminDarknessStrengthOverrides:
            campaign.adminDarknessStrengthOverrides ?? DEFAULT_ADMIN_DARKNESS_STRENGTH_OVERRIDES,
        regions: campaign.regions ?? DEFAULT_CAMPAIGN_REGIONS,
    };
}

/**
 * Keys the PATCH `/api/campaigns/:id` body may include for DarknessStrength
 * (and related stub) persistence. Documented for client writers.
 */
export const CAMPAIGN_DARKNESS_STRENGTH_PATCH_KEYS = [
    'darknessStrengthInstances',
    'adminDarknessStrengthOverrides',
    'regions',
] as const satisfies readonly (keyof CampaignState)[];
