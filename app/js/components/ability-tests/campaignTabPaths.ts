export type TabId = 'welcome' | 'mission_select' | 'join_mission' | 'players' | 'characters' | 'ability_test' | 'terrain_editor' | 'lobby_archive' | 'bestiary';

export const CAMPAIGN_TAB_IDS: TabId[] = ['welcome', 'mission_select', 'join_mission', 'players', 'characters', 'ability_test', 'terrain_editor', 'lobby_archive', 'bestiary'];

/** URL path segment under `/campaign/:tabSlug`. 'players' and 'characters' use /players/* routes instead. */
export const CAMPAIGN_TAB_SLUG: Record<TabId, string> = {
    welcome: 'welcome',
    mission_select: 'mission-select',
    join_mission: 'join-mission',
    players: 'players',
    characters: 'characters',
    ability_test: 'ability-test',
    terrain_editor: 'terrain-editor',
    lobby_archive: 'lobby-archive',
    bestiary: 'bestiary',
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

export function playersListPath(): string {
    return '/players';
}

export function playerCharactersPath(playerId: number | string): string {
    return `/players/${playerId}/characters`;
}

export function playerCharacterPath(playerId: number | string, characterId: string): string {
    return `/players/${playerId}/characters/${characterId}`;
}
