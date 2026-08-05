/**
 * Client-side Quest Prep finalize: ensure run exists, freeze loadout + party roster.
 */

import type { PlayerState } from '../../../types';
import { isControlEnemy, SPECTATOR_ID } from '../state';
import { getQuestDef } from './questRegistry';
import {
    finalizeQuestPrepLoadout,
    startQuestRun,
    type CampaignCharacterSheetSource,
} from './questRun';
import type { QuestLobbyFields } from './questLobby';
import type { QuestPartyRosterEntry, QuestRunState } from './questTypes';

export function buildPartyRosterFromLobby(
    players: Record<string, PlayerState>,
    characterSelections: Record<string, string>,
): QuestPartyRosterEntry[] {
    const roster: QuestPartyRosterEntry[] = [];
    for (const [playerId, selection] of Object.entries(characterSelections)) {
        if (!selection || selection === SPECTATOR_ID || isControlEnemy(selection)) continue;
        const player = players[playerId];
        const playerName = player?.name?.trim();
        if (!playerName) continue;
        if (roster.some((e) => e.characterId === selection && e.playerName === playerName)) continue;
        roster.push({ playerName, characterId: selection });
    }
    return roster;
}

export type EnsureQuestPrepRunParams = {
    existing: QuestRunState | null | undefined;
    lobby: QuestLobbyFields;
    character: CampaignCharacterSheetSource;
    assignedBankId?: string | null;
};

/**
 * Return a prep (or already matching) run for this lobby. Joiners create a matching
 * run using lobby questRunId + questRunSeed.
 */
export function ensureQuestPrepRun(params: EnsureQuestPrepRunParams): QuestRunState {
    const { existing, lobby, character, assignedBankId = null } = params;
    if (
        existing
        && existing.questDefId === lobby.questDefId
        && existing.runId === lobby.questRunId
        && (existing.status === 'prep' || existing.status === 'active')
    ) {
        return existing;
    }
    const questDef = getQuestDef(lobby.questDefId);
    if (!questDef) {
        throw new Error(`Unknown quest for prep finalize: ${lobby.questDefId}`);
    }
    const runSeed = lobby.questRunSeed ?? existing?.runSeed ?? 1;
    return startQuestRun({
        questDef,
        character,
        runSeed,
        assignedBankId,
        runId: lobby.questRunId,
    });
}

export type FreezeQuestPrepForCharacterParams = {
    existingRun: QuestRunState | null | undefined;
    lobby: QuestLobbyFields;
    character: CampaignCharacterSheetSource;
    selectedAbilityIds: readonly string[];
    partyRoster: readonly QuestPartyRosterEntry[];
    assignedBankId?: string | null;
};

/** Ensure run + finalize loadout for leaving Quest Prep. */
export function freezeQuestPrepForCharacter(
    params: FreezeQuestPrepForCharacterParams,
): QuestRunState {
    const run = ensureQuestPrepRun({
        existing: params.existingRun,
        lobby: params.lobby,
        character: params.character,
        assignedBankId: params.assignedBankId,
    });
    return finalizeQuestPrepLoadout({
        run,
        equipment: params.character.equipment,
        selectedAbilityIds: params.selectedAbilityIds,
        partyRoster: params.partyRoster,
    });
}
