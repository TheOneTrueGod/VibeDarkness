import { describe, expect, it } from 'vitest';
import {
    storybookEntryIdFromPath,
    CHARACTER_INNER_TAB_SLUG,
    DEFAULT_CHARACTER_INNER_TAB,
    campaignHomePath,
    campaignPathForTab,
    ideasPath,
    missionOverviewPath,
    parseIdeasSubpath,
    playerCharacterPath,
    playerCharactersPath,
    playerCharacterRootPath,
    tabFromCharacterInnerSlug,
} from './campaignTabPaths';

describe('campaignHomePath', () => {
    it('opens Characters for an admin with an account id', () => {
        expect(campaignHomePath(true, 19)).toBe(playerCharactersPath(19));
        expect(campaignHomePath(true, 19, { appEntry: true })).toBe(playerCharactersPath(19));
    });

    it('opens Characters for any signed-in player entering the app', () => {
        expect(campaignHomePath(false, 19, { appEntry: true })).toBe(playerCharactersPath(19));
    });

    it('opens Join Mission when a non-admin leaves without a character', () => {
        expect(campaignHomePath(false, 19)).toBe(campaignPathForTab('join_mission'));
    });

    it('opens Campaign Summary only when an admin has no account id', () => {
        expect(campaignHomePath(true, null)).toBe(campaignPathForTab('campaign_summary'));
        expect(campaignHomePath(true, '')).toBe(campaignPathForTab('campaign_summary'));
    });
});

describe('character inner tab paths', () => {
    it('defaults playerCharacterPath to the map tab', () => {
        expect(playerCharacterPath(19, 'char_abc')).toBe('/players/19/characters/char_abc/map');
        expect(DEFAULT_CHARACTER_INNER_TAB).toBe('map');
    });

    it('builds an explicit inner-tab path', () => {
        expect(playerCharacterPath(19, 'char_abc', 'upgrades')).toBe(
            `/players/19/characters/char_abc/${CHARACTER_INNER_TAB_SLUG.upgrades}`,
        );
    });

    it('keeps a tab-less root path for defaulting', () => {
        expect(playerCharacterRootPath(19, 'char_abc')).toBe('/players/19/characters/char_abc');
    });

    it('maps slugs to inner tabs and rejects unknowns', () => {
        expect(tabFromCharacterInnerSlug('map')).toBe('map');
        expect(tabFromCharacterInnerSlug('bonuses')).toBe('bonuses');
        expect(tabFromCharacterInnerSlug('nope')).toBeNull();
        expect(tabFromCharacterInnerSlug(undefined)).toBeNull();
    });
});

describe('ideas tab paths', () => {
    it('builds /campaign/ideas/:view/:itemId', () => {
        expect(ideasPath('ideas', '0003')).toBe('/campaign/ideas/ideas/0003');
        expect(ideasPath('plans', '0001')).toBe('/campaign/ideas/plans/0001');
        expect(ideasPath('plans')).toBe('/campaign/ideas/plans');
        expect(ideasPath('storybook', 'resources')).toBe('/campaign/ideas/storybook/resources');
        expect(missionOverviewPath('wod_001')).toBe('/campaign/mission-overview/wod_001');
        expect(missionOverviewPath()).toBe('/campaign/mission-overview');
    });

    it('parses the view and item id after /campaign/ideas/', () => {
        expect(parseIdeasSubpath('plans/0001')).toEqual({ view: 'plans', itemId: '0001' });
        expect(parseIdeasSubpath('ideas')).toEqual({ view: 'ideas', itemId: null });
        expect(parseIdeasSubpath('storybook/resources')).toEqual({ view: 'storybook', itemId: 'resources' });
        expect(parseIdeasSubpath('bogus/0001')).toEqual({ view: null, itemId: '0001' });
        expect(parseIdeasSubpath(undefined)).toEqual({ view: null, itemId: null });
    });
});

describe('storybookEntryIdFromPath', () => {
    it('recognises Storybook URLs, which open without logging in', () => {
        expect(storybookEntryIdFromPath('/campaign/ideas/storybook/research-cards')).toBe('research-cards');
        expect(storybookEntryIdFromPath('/campaign/ideas/storybook/')).toBe('');
        expect(storybookEntryIdFromPath('/campaign/ideas/storybook')).toBe('');
    });

    it('leaves every other path behind the login', () => {
        expect(storybookEntryIdFromPath('/campaign/ideas/plans/0001')).toBeNull();
        expect(storybookEntryIdFromPath('/campaign/ideas/storybookish')).toBeNull();
        expect(storybookEntryIdFromPath('/campaign/characters')).toBeNull();
        expect(storybookEntryIdFromPath('/')).toBeNull();
    });
});
