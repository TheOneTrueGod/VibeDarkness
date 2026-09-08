import { describe, expect, it } from 'vitest';
import { CAMPAIGN_TAB_IDS } from '../ability-tests/campaignTabPaths';
import { CAMPAIGN_HOME_TABS, getCampaignHomeTab } from './campaignHomeTabs';

describe('campaignHomeTabs', () => {
    it('registers every TabId exactly once, in CAMPAIGN_TAB_IDS order', () => {
        expect(CAMPAIGN_HOME_TABS.map((tab) => tab.id)).toEqual([...CAMPAIGN_TAB_IDS]);
    });

    it('gives every tab a non-empty label', () => {
        for (const tab of CAMPAIGN_HOME_TABS) {
            expect(tab.label.length).toBeGreaterThan(0);
        }
    });

    it('looks up each tab by id', () => {
        for (const id of CAMPAIGN_TAB_IDS) {
            expect(getCampaignHomeTab(id).id).toBe(id);
        }
    });
});
