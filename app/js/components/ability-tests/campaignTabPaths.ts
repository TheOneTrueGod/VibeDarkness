export type TabId = 'welcome' | 'mission_select' | 'join_mission' | 'players' | 'ability_test';

export const CAMPAIGN_TAB_IDS: TabId[] = ['welcome', 'mission_select', 'join_mission', 'players', 'ability_test'];

/** URL path segment under `/campaign/:tabSlug` */
export const CAMPAIGN_TAB_SLUG: Record<TabId, string> = {
    welcome: 'welcome',
    mission_select: 'mission-select',
    join_mission: 'join-mission',
    players: 'players',
    ability_test: 'ability-test',
};

const SLUG_TO_TAB = Object.fromEntries(
    (Object.keys(CAMPAIGN_TAB_SLUG) as TabId[]).map((tab) => [CAMPAIGN_TAB_SLUG[tab], tab]),
) as Record<string, TabId>;

export function tabFromCampaignSlug(slug: string | undefined): TabId | null {
    if (!slug) return null;
    return SLUG_TO_TAB[slug] ?? null;
}

export function campaignPathForTab(tab: TabId): string {
    return `/campaign/${CAMPAIGN_TAB_SLUG[tab]}`;
}
