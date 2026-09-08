/**
 * First character for a new (or empty) campaign account.
 * Portrait is chosen from the IDs that player is allowed to select.
 */
import type { CampaignCharacterPayload, CreateCharacterPayload } from '../../../LobbyClient';
import { getRandomCharacterName } from './characterNames';
import { getDefaultEquipmentForCampaign } from './items';
import { pickRandomPortraitIdForPlayer } from './portraitLoader';
import { WorldOfDarknessStoryline } from '../storylines/WorldOfDarkness/WorldOfDarkness';

export const STARTER_STORYLINE_ID = WorldOfDarknessStoryline.id;
export const STARTER_MISSION_ID = WorldOfDarknessStoryline.startMissionId;

export interface StarterCharacterApi {
    getMyCharacters(): Promise<CampaignCharacterPayload[]>;
    createCharacter(
        payload: CreateCharacterPayload,
    ): Promise<{ character: CampaignCharacterPayload; characters: CampaignCharacterPayload[] }>;
}

/** Concurrent ensure() calls for the same account share one in-flight request. */
const ensureInFlight = new Map<number, Promise<CampaignCharacterPayload[]>>();

export function buildStarterCharacterPayload(playerId: number): CreateCharacterPayload | null {
    const portraitId = pickRandomPortraitIdForPlayer(playerId);
    if (portraitId === undefined) {
        return null;
    }
    return {
        portraitId,
        campaignId: STARTER_STORYLINE_ID,
        missionId: STARTER_MISSION_ID,
        name: getRandomCharacterName(),
        equipment: getDefaultEquipmentForCampaign(STARTER_STORYLINE_ID),
    };
}

/**
 * Returns the account's characters, creating a World of Darkness starter if the list is empty.
 */
export function ensureAccountHasStarterCharacter(
    api: StarterCharacterApi,
    playerId: number,
): Promise<CampaignCharacterPayload[]> {
    const existing = ensureInFlight.get(playerId);
    if (existing) {
        return existing;
    }
    const promise = (async () => {
        const characters = await api.getMyCharacters();
        if (characters.length > 0) {
            return characters;
        }
        const payload = buildStarterCharacterPayload(playerId);
        if (payload === null) {
            return characters;
        }
        const result = await api.createCharacter(payload);
        return result.characters;
    })();
    ensureInFlight.set(playerId, promise);
    return promise.finally(() => {
        ensureInFlight.delete(playerId);
    });
}
