import { describe, expect, it } from 'vitest';
import {
    CHARACTER_INNER_TAB_SLUG,
    DEFAULT_CHARACTER_INNER_TAB,
    ideasPath,
    parseIdeasSubpath,
    playerCharacterPath,
    playerCharacterRootPath,
    tabFromCharacterInnerSlug,
} from './campaignTabPaths';

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
    });

    it('parses the view and item id after /campaign/ideas/', () => {
        expect(parseIdeasSubpath('plans/0001')).toEqual({ view: 'plans', itemId: '0001' });
        expect(parseIdeasSubpath('ideas')).toEqual({ view: 'ideas', itemId: null });
        expect(parseIdeasSubpath('bogus/0001')).toEqual({ view: null, itemId: '0001' });
        expect(parseIdeasSubpath(undefined)).toEqual({ view: null, itemId: null });
    });
});
