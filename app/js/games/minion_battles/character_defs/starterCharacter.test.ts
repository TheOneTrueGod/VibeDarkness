import { describe, expect, it, vi } from 'vitest';
import { CHARACTER_NAMES } from './characterNames';
import { getDefaultEquipmentForCampaign } from './items';
import { getPortraitIdsForPlayer } from './portraitLoader';
import {
    STARTER_MISSION_ID,
    STARTER_STORYLINE_ID,
    buildStarterCharacterPayload,
    ensureAccountHasStarterCharacter,
    type StarterCharacterApi,
} from './starterCharacter';
import type { CampaignCharacterPayload } from '../../../LobbyClient';
import { WorldOfDarknessStoryline } from '../storylines/WorldOfDarkness/WorldOfDarkness';

const OUTSIDER_ID = 9_999_999;

function stubCharacter(id: string): CampaignCharacterPayload {
    return {
        id,
        equipment: [],
        knowledge: {},
        traits: [],
        portraitId: 'warrior',
        battleChipDetails: {},
        campaignId: STARTER_STORYLINE_ID,
        missionId: STARTER_MISSION_ID,
    };
}

describe('buildStarterCharacterPayload', () => {
    it('uses the World of Darkness start and an eligible portrait', () => {
        const payload = buildStarterCharacterPayload(OUTSIDER_ID);
        expect(payload).not.toBeNull();
        expect(payload?.campaignId).toBe(WorldOfDarknessStoryline.id);
        expect(payload?.missionId).toBe(WorldOfDarknessStoryline.startMissionId);
        expect(payload?.equipment).toEqual(getDefaultEquipmentForCampaign(STARTER_STORYLINE_ID));
        expect(CHARACTER_NAMES).toContain(payload?.name);
        expect(getPortraitIdsForPlayer(OUTSIDER_ID)).toContain(payload?.portraitId);
    });
});

describe('ensureAccountHasStarterCharacter', () => {
    it('creates a starter when the account has no characters', async () => {
        const created = stubCharacter('char_new');
        const api: StarterCharacterApi = {
            getMyCharacters: vi.fn().mockResolvedValue([]),
            createCharacter: vi.fn().mockResolvedValue({ character: created, characters: [created] }),
        };
        const result = await ensureAccountHasStarterCharacter(api, OUTSIDER_ID);
        expect(api.createCharacter).toHaveBeenCalledOnce();
        const payload = vi.mocked(api.createCharacter).mock.calls[0]?.[0];
        expect(payload?.campaignId).toBe(STARTER_STORYLINE_ID);
        expect(getPortraitIdsForPlayer(OUTSIDER_ID)).toContain(payload?.portraitId);
        expect(result).toEqual([created]);
    });

    it('does not create when characters already exist', async () => {
        const existing = [stubCharacter('char_old')];
        const api: StarterCharacterApi = {
            getMyCharacters: vi.fn().mockResolvedValue(existing),
            createCharacter: vi.fn(),
        };
        const result = await ensureAccountHasStarterCharacter(api, OUTSIDER_ID + 1);
        expect(api.createCharacter).not.toHaveBeenCalled();
        expect(result).toEqual(existing);
    });

    it('coalesces concurrent ensures into one create', async () => {
        const created = stubCharacter('char_once');
        let resolveGet!: (value: CampaignCharacterPayload[]) => void;
        const getPromise = new Promise<CampaignCharacterPayload[]>((resolve) => {
            resolveGet = resolve;
        });
        const api: StarterCharacterApi = {
            getMyCharacters: vi.fn().mockReturnValue(getPromise),
            createCharacter: vi.fn().mockResolvedValue({ character: created, characters: [created] }),
        };
        const playerId = OUTSIDER_ID + 2;
        const first = ensureAccountHasStarterCharacter(api, playerId);
        const second = ensureAccountHasStarterCharacter(api, playerId);
        resolveGet([]);
        const [a, b] = await Promise.all([first, second]);
        expect(api.getMyCharacters).toHaveBeenCalledOnce();
        expect(api.createCharacter).toHaveBeenCalledOnce();
        expect(a).toEqual([created]);
        expect(b).toEqual([created]);
    });
});
