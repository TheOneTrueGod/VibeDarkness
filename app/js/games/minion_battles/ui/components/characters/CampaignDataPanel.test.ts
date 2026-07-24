import { describe, expect, it } from 'vitest';
import { collectPlayerCampaignIds } from './CampaignDataPanel';
import type { AccountState } from '../../../../../types';
import type { CampaignCharacter } from '../../../character_defs/CampaignCharacter';

function char(partial: { id: string; campaignId: string }): CampaignCharacter {
    return {
        id: partial.id,
        campaignId: partial.campaignId,
        name: partial.id,
    } as CampaignCharacter;
}

describe('collectPlayerCampaignIds', () => {
    it('defaults to first character campaignId and dedupes account ids', () => {
        const account: AccountState = {
            id: 1,
            name: 'Admin',
            role: 'admin',
            fire: 0,
            water: 0,
            earth: 0,
            air: 0,
            campaignIds: ['world_of_darkness', 'extra_campaign', 'world_of_darkness'],
        };
        const ids = collectPlayerCampaignIds(
            [char({ id: 'c1', campaignId: 'world_of_darkness' }), char({ id: 'c2', campaignId: 'other' })],
            account,
        );
        expect(ids).toEqual(['world_of_darkness', 'other', 'extra_campaign']);
    });

    it('falls back to account campaignIds when there are no characters', () => {
        const account: AccountState = {
            id: 1,
            name: 'Admin',
            role: 'admin',
            fire: 0,
            water: 0,
            earth: 0,
            air: 0,
            campaignIds: ['solo_campaign'],
        };
        expect(collectPlayerCampaignIds([], account)).toEqual(['solo_campaign']);
    });
});
