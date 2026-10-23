import { describe, expect, it } from 'vitest';
import { ITEMS, ITEM_ICON_URLS, ALL_PLAYER_ITEMS } from './index';
import { getItemUpgradesFor, getItemsForTier } from './itemUpgrades';

const ids = (defs: { id: string }[]) => defs.map((d) => d.id).sort();

describe('getItemUpgradesFor', () => {
    it('lists the tier-2 upgrades of each base weapon', () => {
        expect(ids(getItemUpgradesFor('001'))).toEqual(['011', '012']);
        expect(ids(getItemUpgradesFor('002'))).toEqual(['013', '014']);
        expect(ids(getItemUpgradesFor('003'))).toEqual(['015']);
    });

    it('chains the shield to Charged Shield', () => {
        expect(ids(getItemUpgradesFor('015'))).toEqual(['016']);
        expect(getItemUpgradesFor('016')).toEqual([]);
    });

    it('returns nothing for unknown items', () => {
        expect(getItemUpgradesFor('nope')).toEqual([]);
    });
});

describe('getItemsForTier', () => {
    it('returns the three base weapons for tier 1', () => {
        expect(ids(getItemsForTier({ campaignId: 'world_of_darkness', slot: 'weapon', tier: 1 }))).toEqual([
            '001',
            '002',
            '003',
        ]);
    });

    it('returns the five tier-2 weapons', () => {
        expect(ids(getItemsForTier({ campaignId: 'world_of_darkness', slot: 'weapon', tier: 2 }))).toEqual([
            '011',
            '012',
            '013',
            '014',
            '015',
        ]);
    });

    it('returns Charged Shield for tier 3', () => {
        expect(ids(getItemsForTier({ campaignId: 'world_of_darkness', slot: 'weapon', tier: 3 }))).toEqual(['016']);
    });

    it('never sweeps in other campaigns or other slots', () => {
        expect(getItemsForTier({ campaignId: 'bunker_at_the_end', slot: 'weapon', tier: 1 })).toEqual([]);
        expect(getItemsForTier({ campaignId: 'world_of_darkness', slot: 'utility', tier: 1 })).toEqual([]);
    });
});

describe('new equipment registration', () => {
    it('registers cards, icons and player availability', () => {
        expect(ITEMS['011'].cardsToAdd).toEqual(['throw_charged_rock']);
        expect(ITEMS['012'].cardsToAdd).toEqual(['throw_knife']);
        expect(ITEMS['013'].cardsToAdd).toEqual(['0112']);
        expect(ITEMS['014'].cardsToAdd).toEqual(['0115']);
        expect(ITEMS['015'].cardsToAdd).toEqual(['0110']);
        expect(ITEMS['016'].cardsToAdd).toEqual(['0113', '0121']);
        for (const id of ['011', '012', '013', '014', '015', '016']) {
            expect(ITEM_ICON_URLS[id]).toBeTruthy();
            expect(ALL_PLAYER_ITEMS).toContain(id);
        }
        expect(ITEMS['002'].name).toBe('Stick');
        expect(ITEMS['003'].name).toBe('Shield');
    });
});
