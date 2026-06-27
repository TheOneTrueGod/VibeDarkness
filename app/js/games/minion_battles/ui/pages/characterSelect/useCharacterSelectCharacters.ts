import { useCallback, useEffect } from 'react';
import { MessageType } from '../../../../../MessageTypes';
import type { MinionBattlesApi } from '../../../api/minionBattlesApi';
import { fromCampaignCharacterData } from '../../../character_defs/CampaignCharacter';
import type { CampaignCharacterData } from '../../../character_defs/campaignCharacterTypes';
import { getPortrait } from '../../../character_defs/portraits';
import { SPECTATOR_ID, isControlEnemy } from '../../../state';
import type { CharacterSelectState } from './useCharacterSelectState';

interface UseCharacterSelectCharactersParams {
    api: MinionBattlesApi;
    playerId: string;
    state: CharacterSelectState;
    characterSelections: Record<string, string>;
    campaignId: string;
    missionId: string;
    setLocalOverride?: (path: string, value: unknown) => void;
    removeLocalOverride?: (path: string) => void;
}

export function useCharacterSelectCharacters({
    api,
    playerId,
    state,
    characterSelections,
    campaignId,
    missionId,
    setLocalOverride,
    removeLocalOverride,
}: UseCharacterSelectCharactersParams) {
    const {
        myCharacters, setMyCharacters,
        sortedCharacters, myLockedCharacterId, missionTraitFilter,
        mySelection, activeTab, editorOpen, creatorOpen,
        autoSelectAttemptedForMissionRef, charactersLoading,
        setCreatorOpen, setEditorOpen, setEditorForceEditable, setView,
    } = state;

    const handleSelectCharacter = useCallback(
        async (characterId: string, portraitId: string, characterDisplayName?: string) => {
            const overridePath = `characterSelections.${playerId}`;
            setLocalOverride?.(overridePath, characterId);
            try {
                await api.sendMessage(MessageType.CHARACTER_SELECT, {
                    characterId,
                    portraitId,
                    ...(typeof characterDisplayName === 'string' && characterDisplayName.trim() !== ''
                        ? { characterDisplayName: characterDisplayName.trim() }
                        : {}),
                });
            } catch (error) {
                removeLocalOverride?.(overridePath);
                console.error('Failed to select character:', error);
                throw error;
            }
        },
        [api, playerId, setLocalOverride, removeLocalOverride],
    );

    const handleSelectCharacterAndShowOverview = useCallback(
        async (characterId: string, portraitId: string, characterDisplayName?: string) => {
            await handleSelectCharacter(characterId, portraitId, characterDisplayName);
            setView('overview');
        },
        [handleSelectCharacter, setView],
    );

    useEffect(() => {
        if (charactersLoading) return;
        if (autoSelectAttemptedForMissionRef.current) return;
        if (myCharacters.length === 0) return;
        if (mySelection != null) return;
        if (activeTab === 'players' || editorOpen || creatorOpen) return;

        const requiredChar = myLockedCharacterId
            ? myCharacters.find((c) => c.id === myLockedCharacterId) ?? null
            : null;
        const chosen =
            requiredChar ??
            sortedCharacters.find((c) => c.canBeUsedOnMission(campaignId, missionId, missionTraitFilter)) ??
            sortedCharacters[0];
        if (chosen == null) return;

        autoSelectAttemptedForMissionRef.current = true;
        const portrait = getPortrait(chosen.portraitId);
        const displayName = chosen.name || (portrait?.name ?? 'Character');
        void handleSelectCharacter(chosen.id, chosen.portraitId, displayName).catch(() => {
            autoSelectAttemptedForMissionRef.current = false;
        });
    }, [
        charactersLoading, myCharacters, sortedCharacters, mySelection,
        activeTab, editorOpen, creatorOpen, campaignId, missionId,
        missionTraitFilter, handleSelectCharacter, myLockedCharacterId,
        autoSelectAttemptedForMissionRef,
    ]);

    const handleCreateCharacter = useCallback(
        (characterId: string, portraitId: string, characterDisplayName?: string) => {
            setCreatorOpen(false);
            handleSelectCharacter(characterId, portraitId, characterDisplayName);
            setEditorForceEditable(true);
            setEditorOpen(true);
        },
        [handleSelectCharacter, setCreatorOpen, setEditorForceEditable, setEditorOpen],
    );

    const createCharacterApi = useCallback(
        async (payload: { portraitId: string; campaignId: string; missionId: string; name?: string }) => {
            const { character, characters } = await api.createCharacter(payload);
            if (characters && characters.length > 0) {
                setMyCharacters((characters as CampaignCharacterData[]).map((d) => fromCampaignCharacterData(d)));
            }
            return { id: character.id, portraitId: character.portraitId, name: character.name };
        },
        [api, setMyCharacters],
    );

    const handleDeleteCharacter = useCallback(
        async (characterId: string) => {
            if (!window.confirm('Delete this character? This cannot be undone.')) return;
            try {
                const characters = await api.deleteCharacter(characterId);
                setMyCharacters((characters as CampaignCharacterData[]).map((d) => fromCampaignCharacterData(d)));
            } catch (error) {
                console.error('Failed to delete character:', error);
            }
        },
        [api, setMyCharacters],
    );

    const handleEditorSaved = useCallback(() => {
        void api.getMyCharacters()
            .then((list) => {
                const chars = (list as CampaignCharacterData[]).map((d) => fromCampaignCharacterData(d));
                setMyCharacters(chars);
                const sel = characterSelections[playerId];
                if (!sel || sel === SPECTATOR_ID || isControlEnemy(sel)) return;
                const updated = chars.find((c) => c.id === sel);
                if (!updated) return;
                const port = getPortrait(updated.portraitId);
                const displayName = updated.name || (port?.name ?? 'Character');
                void api.sendMessage(MessageType.CHARACTER_SELECT, {
                    characterId: updated.id,
                    portraitId: updated.portraitId,
                    characterDisplayName: displayName,
                });
            })
            .catch(() => {});
    }, [api, characterSelections, playerId, setMyCharacters]);

    return {
        handleSelectCharacter,
        handleSelectCharacterAndShowOverview,
        handleCreateCharacter,
        createCharacterApi,
        handleDeleteCharacter,
        handleEditorSaved,
    };
}
