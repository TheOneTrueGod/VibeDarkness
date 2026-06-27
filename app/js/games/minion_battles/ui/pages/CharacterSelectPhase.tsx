/**
 * Character Select Phase - React component
 * Shows "Create Character" card (top left) and list of player's campaign characters.
 * Characters sorted by server `lastUsed` (most recent mission first), then mission eligibility.
 * Disallow reason shown diagonally on cards when they cannot be used.
 */
import React from 'react';
import type { PlayerState } from '../../../../types';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import type { PreMissionStoryDef } from '../../storylines/storyTypes';
import type { IBaseMissionDef } from '../../storylines/BaseMissionDef';
import { ALL_PLAYER_ITEMS } from '../../character_defs/items';
import { isControlEnemy, SPECTATOR_ID } from '../../state';
import CharacterCreator from '../components/CharacterEditor/CharacterCreator';
import CharacterEditor from '../components/CharacterEditor/CharacterEditor';
import CharactersPanel from '../components/characters/CharactersPanel';
import ReplayUi from '../../replay/ReplayUi';
import { useCurrentUser } from '../../../../user/useCurrentUser';
import { useUserData } from '../../../../user/UserDataProvider';
import { useCharacterSelectState } from './characterSelect/useCharacterSelectState';
import { useCharacterSelectCharacters } from './characterSelect/useCharacterSelectCharacters';
import { useCharacterSelectPhase } from './characterSelect/useCharacterSelectPhase';
import { CharacterSelectHeader } from './characterSelect/CharacterSelectHeader';
import { CharacterGrid } from './characterSelect/CharacterGrid';
import { CharacterSelectFooter } from './characterSelect/CharacterSelectFooter';
import { CharacterOverview } from './characterSelect/CharacterOverview';

interface CharacterSelectPhaseProps {
    api: MinionBattlesApi;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
    /** Player IDs that have clicked Ready. */
    characterSelectReadyPlayerIds?: string[];
    /** Current mission (from votes). */
    missionId?: string;
    /** Current campaign ID (from mission def or fallback to missionId). */
    campaignId?: string;
    /** Mission def for trait allow/deny and preMissionStory. */
    missionDef?: IBaseMissionDef | null;
    /** Pre-mission story for current mission; when set and all selected, show Continue instead of Start Game. */
    preMissionStory?: PreMissionStoryDef | null;
    /** Required players whose presence is needed before the battle can start (from Mission Map flow). */
    requiredPlayers?: Array<{ playerName: string; characterId: string }>;
    setLocalOverride?: (path: string, value: unknown) => void;
    removeLocalOverride?: (path: string) => void;
    onPhaseChange?: (phase: string, gameState: Record<string, unknown>) => void;
}

export default function CharacterSelectPhase({
    api,
    playerId,
    isHost,
    players,
    characterSelections,
    characterSelectReadyPlayerIds = [],
    missionId = '',
    campaignId: campaignIdProp = '',
    missionDef,
    preMissionStory,
    requiredPlayers = [],
    setLocalOverride,
    removeLocalOverride,
    onPhaseChange,
}: CharacterSelectPhaseProps) {
    const { isAdmin } = useCurrentUser();
    const { user } = useUserData();
    const campaignId = campaignIdProp || (missionDef?.campaignId ?? missionId);

    const state = useCharacterSelectState({
        api, playerId, players, characterSelections, characterSelectReadyPlayerIds,
        missionId, campaignId, missionDef, requiredPlayers, isAdmin,
    });

    const chars = useCharacterSelectCharacters({
        api, playerId, state, characterSelections, campaignId, missionId,
        setLocalOverride, removeLocalOverride,
    });

    const phase = useCharacterSelectPhase({
        api, state, characterSelections, onPhaseChange, isHost, preMissionStory, missionDef,
    });

    const {
        mySelection, characterToEdit, editorOpen, setEditorOpen, editorForceEditable, setEditorForceEditable,
        creatorOpen, setCreatorOpen, createCardRef, setCreateCardRef,
        activeTab, setActiveTab, view, setView, campaign,
        charactersLoading, myLockedCharacterId, sortedCharacters, missionTraitFilter,
        resolvedRequiredPlayers, controlEnemySelectedBy,
        effectivelyReady, setReadyLoading, allRequiredPlayersPresent, allSelected, allReady, atLeastOneCharacter,
    } = state;

    return (
        <div className="w-full h-full flex flex-col max-w-[1200px] mx-auto">
            <CharacterSelectHeader
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                isAdmin={isAdmin}
                editorOpen={editorOpen}
                characterToEdit={characterToEdit}
            />

            {activeTab === 'players' && isAdmin ? (
                <div className="flex-1 min-h-0 overflow-hidden px-5 pb-4">
                    <CharactersPanel api={api} players={players} />
                </div>
            ) : activeTab === 'replay' && isAdmin ? (
                <div className="flex-1 min-h-0 overflow-hidden px-5 pb-4">
                    <ReplayUi />
                </div>
            ) : editorOpen && characterToEdit ? (
                <div className="flex-1 min-h-0 overflow-hidden px-5 pb-4">
                    <CharacterEditor
                        character={characterToEdit}
                        api={api}
                        onSaved={chars.handleEditorSaved}
                        onClose={() => { setEditorOpen(false); setEditorForceEditable(false); }}
                        editMode={isAdmin || editorForceEditable}
                        inventoryItems={isAdmin ? ALL_PLAYER_ITEMS : user?.inventoryItemIds ?? []}
                        showInventoryPanel={(isAdmin ? ALL_PLAYER_ITEMS : user?.inventoryItemIds ?? []).length > 0}
                        account={user}
                        campaign={campaign}
                        equippedItemsDisplay="list"
                        localPlayerId={user?.id}
                        hideMissionMap
                    />
                </div>
            ) : view === 'overview' && characterToEdit && mySelection && mySelection !== SPECTATOR_ID && !isControlEnemy(mySelection) ? (
                <CharacterOverview character={characterToEdit} onChangeCharacter={() => setView('grid')} />
            ) : (
                <CharacterGrid
                    charactersLoading={charactersLoading}
                    myLockedCharacterId={myLockedCharacterId}
                    sortedCharacters={sortedCharacters}
                    campaignId={campaignId}
                    missionId={missionId}
                    missionTraitFilter={missionTraitFilter}
                    mySelection={mySelection}
                    characterSelections={characterSelections}
                    players={players}
                    resolvedRequiredPlayers={resolvedRequiredPlayers}
                    isAdmin={isAdmin}
                    controlEnemySelectedBy={controlEnemySelectedBy}
                    playerId={playerId}
                    onSelect={chars.handleSelectCharacterAndShowOverview}
                    onDelete={chars.handleDeleteCharacter}
                    onOpenCreator={() => setCreatorOpen(true)}
                    setCreateCardRef={setCreateCardRef}
                />
            )}

            {creatorOpen && (
                <CharacterCreator
                    campaignId={campaignId}
                    missionId={missionId}
                    onCreate={chars.handleCreateCharacter}
                    onClose={() => setCreatorOpen(false)}
                    createCharacter={chars.createCharacterApi}
                    anchorRef={{ current: createCardRef }}
                    localPlayerId={user?.id}
                />
            )}

            <CharacterSelectFooter
                activeTab={activeTab}
                editorOpen={editorOpen}
                mySelection={mySelection}
                effectivelyReady={effectivelyReady}
                setReadyLoading={setReadyLoading}
                allRequiredPlayersPresent={allRequiredPlayersPresent}
                allSelected={allSelected}
                allReady={allReady}
                atLeastOneCharacter={atLeastOneCharacter}
                resolvedRequiredPlayers={resolvedRequiredPlayers}
                characterToEdit={characterToEdit}
                onSetReady={phase.handleSetReady}
                onOpenEditor={() => setEditorOpen(true)}
                onCloseEditor={() => { setEditorOpen(false); setEditorForceEditable(false); }}
            />
        </div>
    );
}
