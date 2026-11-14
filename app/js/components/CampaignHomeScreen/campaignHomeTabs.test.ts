import { describe, expect, it } from 'vitest';
import { CAMPAIGN_TAB_IDS } from '../ability-tests/campaignTabPaths';
import { CAMPAIGN_HOME_TABS, getCampaignHomeTab } from './campaignHomeTabs';
import { canViewCampaignHomeTab, type CampaignHomeTabViewer } from './campaignHomeTabDef';

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

    it('shows Ability Test, Ideas, Bestiary, Lobby Archive and Mission Overview to managers, and other staff tabs to admins only', () => {
        const visibleTo = (viewer: CampaignHomeTabViewer) =>
            CAMPAIGN_HOME_TABS.filter((tab) => canViewCampaignHomeTab(tab.access, viewer)).map((tab) => tab.id);
        const user = visibleTo({ isAdmin: false, canViewManagerScreens: false });
        const manager = visibleTo({ isAdmin: false, canViewManagerScreens: true });
        const admin = visibleTo({ isAdmin: true, canViewManagerScreens: true });

        expect(manager.filter((id) => !user.includes(id)).sort()).toEqual(['ability_test', 'bestiary', 'ideas', 'lobby_archive', 'mission_overview']);
        expect(admin).toEqual([...CAMPAIGN_TAB_IDS]);
    });
});
