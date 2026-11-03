import { describe, expect, it } from 'vitest';
import type { StorylineDef } from '../../../games/minion_battles/storylines/types';
import {
    SUMMARY_PLAYER_COLORS,
    assignPlayerColors,
    defaultTrackedCharacterId,
    formatLastLogin,
    getMissionsCharacterIsAt,
    sortSummaryAccounts,
} from './campaignSummary';

const storyline = {
    id: 'test_story',
    title: 'Test',
    startMissionId: 'a',
    edges: [
        { fromMissionId: 'a', toMissionId: 'b', result: 'victory' },
        { fromMissionId: 'a', toMissionId: 'side', result: 'victory', isSideMission: true },
        { fromMissionId: 'b', toMissionId: 'c', result: 'victory' },
    ],
} as unknown as StorylineDef;

function character(results: string[], campaignId = 'test_story') {
    return {
        campaignId,
        missionResults: { [campaignId]: results.map((missionId) => ({ missionId, result: 'victory' })) },
        questResults: {},
    };
}

describe('sortSummaryAccounts', () => {
    it('orders favourites, then latest login, then name', () => {
        const sorted = sortSummaryAccounts([
            { name: 'Zed', lastLoginAt: null },
            { name: 'Amy', lastLoginAt: null },
            { name: 'Old', lastLoginAt: 100 },
            { name: 'New', lastLoginAt: 200 },
            { name: 'Fav', adminFavorite: true, lastLoginAt: 1 },
        ]);
        expect(sorted.map((a) => a.name)).toEqual(['Fav', 'New', 'Old', 'Amy', 'Zed']);
    });
});

describe('assignPlayerColors', () => {
    it('assigns by ascending id regardless of list order', () => {
        const colors = assignPlayerColors([{ id: 7 }, { id: 2 }, { id: 5 }]);
        expect(colors.get(2)).toBe(SUMMARY_PLAYER_COLORS[0]);
        expect(colors.get(5)).toBe(SUMMARY_PLAYER_COLORS[1]);
        expect(colors.get(7)).toBe(SUMMARY_PLAYER_COLORS[2]);
    });
});

describe('defaultTrackedCharacterId', () => {
    const chars = [{ id: 'x', lastUsed: 10 }, { id: 'y', lastUsed: 50 }];
    it('keeps a stored character that still exists', () => {
        expect(defaultTrackedCharacterId({ adminFavoriteCharacterId: 'x' }, chars)).toBe('x');
    });
    it('falls back to the most recently used', () => {
        expect(defaultTrackedCharacterId({ adminFavoriteCharacterId: 'gone' }, chars)).toBe('y');
        expect(defaultTrackedCharacterId({}, [])).toBeNull();
    });
});

describe('getMissionsCharacterIsAt', () => {
    it('a fresh character is at the start mission', () => {
        expect([...getMissionsCharacterIsAt(storyline, character([]))]).toEqual(['a']);
    });
    it('after a win, is at every newly opened mission but not the won one', () => {
        expect([...getMissionsCharacterIsAt(storyline, character(['a']))].sort()).toEqual(['b', 'side']);
        expect([...getMissionsCharacterIsAt(storyline, character(['a', 'b']))].sort()).toEqual(['c', 'side']);
    });
    it('is nowhere in a campaign the character is not on', () => {
        expect(getMissionsCharacterIsAt(storyline, character([], 'other')).size).toBe(0);
    });
});

describe('formatLastLogin', () => {
    it('formats relative times', () => {
        expect(formatLastLogin(null, 1000)).toBe('never');
        expect(formatLastLogin(990, 1000)).toBe('just now');
        expect(formatLastLogin(1000 - 300, 1000)).toBe('5m ago');
        expect(formatLastLogin(10000 - 7200, 10000)).toBe('2h ago');
    });
});
