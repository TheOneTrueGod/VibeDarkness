/**
 * Documents the campaign API payload shape for DarknessStrength fields
 * (mirrors PHP `Campaign::toArray` / `fromArray` defaults).
 */
import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import {
    CAMPAIGN_DARKNESS_STRENGTH_PATCH_KEYS,
    DEFAULT_ADMIN_DARKNESS_STRENGTH_OVERRIDES,
    DEFAULT_CAMPAIGN_REGIONS,
    DEFAULT_DARKNESS_STRENGTH_INSTANCES,
    withCampaignDarknessStrengthDefaults,
} from './campaignFields';

const BASE_CAMPAIGN: Omit<CampaignState, 'darknessStrengthInstances'> = {
    id: 'camp_test',
    name: 'Test',
    campaignCharacters: [],
    missionResults: [],
    resources: { food: 0, metal: 0, population: 0, crystals: 0 },
};

describe('campaign DarknessStrength API payload shape', () => {
    it('defaults missing instances/overrides/regions to [] / {} / {}', () => {
        const normalized = withCampaignDarknessStrengthDefaults({ ...BASE_CAMPAIGN });
        expect(normalized.darknessStrengthInstances).toEqual(DEFAULT_DARKNESS_STRENGTH_INSTANCES);
        expect(normalized.adminDarknessStrengthOverrides).toEqual(
            DEFAULT_ADMIN_DARKNESS_STRENGTH_OVERRIDES,
        );
        expect(normalized.regions).toEqual(DEFAULT_CAMPAIGN_REGIONS);
        expect(Array.isArray(normalized.darknessStrengthInstances)).toBe(true);
        expect(normalized.adminDarknessStrengthOverrides).not.toBeNull();
        expect(normalized.regions).not.toBeNull();
    });

    it('round-trips a sample PATCH payload shape through defaults without dropping data', () => {
        const patch: Pick<
            CampaignState,
            'darknessStrengthInstances' | 'adminDarknessStrengthOverrides' | 'regions'
        > = {
            darknessStrengthInstances: [
                { packageId: 'ds_enemy_hardened', data: { battlesRemaining: 10 } },
            ],
            adminDarknessStrengthOverrides: {
                ds_swarm_reinforcements: { enabled: true, data: { killCount: 0 } },
                ds_enemy_fierce: { enabled: false },
            },
            regions: {
                stub_region: { activeDomainPackageIds: ['ds_enemy_hardened'] },
            },
        };

        for (const key of CAMPAIGN_DARKNESS_STRENGTH_PATCH_KEYS) {
            expect(key in patch).toBe(true);
        }

        const normalized = withCampaignDarknessStrengthDefaults({
            ...BASE_CAMPAIGN,
            ...patch,
        });

        expect(normalized.darknessStrengthInstances).toEqual(patch.darknessStrengthInstances);
        expect(normalized.adminDarknessStrengthOverrides).toEqual(
            patch.adminDarknessStrengthOverrides,
        );
        expect(normalized.regions).toEqual(patch.regions);
    });

    it('preserves empty maps when explicitly provided (clear overrides / regions)', () => {
        const normalized = withCampaignDarknessStrengthDefaults({
            ...BASE_CAMPAIGN,
            darknessStrengthInstances: [],
            adminDarknessStrengthOverrides: {},
            regions: {},
        });
        expect(normalized.darknessStrengthInstances).toEqual([]);
        expect(normalized.adminDarknessStrengthOverrides).toEqual({});
        expect(normalized.regions).toEqual({});
    });
});
