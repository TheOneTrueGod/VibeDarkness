/**
 * Character Select Phase - React component
 * Shows "Create Character" card (top left) and list of player's campaign characters.
 * Characters sorted by server `lastUsed` (most recent mission first), then mission eligibility.
 * Disallow reason shown diagonally on cards when they cannot be used.
 * Quest Prep (quest lobby, status prep / first slot) uses dedicated center + bottom segments.
 */
import React, { useCallback, useMemo, useRef } from 'react';
import type { PlayerState } from '../../../../types';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import type { PreMissionStoryDef } from '../../storylines/storyTypes';
import type { IBaseMissionDef } from '../../storylines/BaseMissionDef';
import type { QuestLobbyFields } from '../../storylines/questLobby';
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
import CharacterSelectLayout from './characterSelect/CharacterSelectLayout';
import { CharacterSelectCornerPortrait } from './characterSelect/CharacterSelectCornerPortrait';
import { CharacterSelectBottomAbilityList } from './characterSelect/CharacterSelectBottomAbilityList';
import { CharacterSelectAdminTabsCorner } from './characterSelect/CharacterSelectAdminTabsCorner';
import ColumnSlotPlayerStatuses from '../../../../components/battleUILayout/ColumnSlotPlayerStatuses';
import { QuestPrepOverview } from './characterSelect/questPrep/QuestPrepOverview';
import { QuestPrepAbilitySlotBar } from './characterSelect/questPrep/QuestPrepAbilitySlotBar';
import {
    QuestPrepLoadoutProvider,
    useQuestPrepLoadoutContext,
} from './characterSelect/questPrep/QuestPrepLoadoutContext';
import type { CampaignCharacter } from '../../character_defs/CampaignCharacter';
import {
    buildPartyRosterFromLobby,
    freezeQuestPrepForCharacter,
} from '../../storylines/questPrepFinalize';

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
    /** Active quest lobby stamp (when this lobby is part of a quest run). */
    questLobbyFields?: QuestLobbyFields | null;
    /** In-progress Quest Prep primary ability picks by player id. */
    questPrepLoadoutsByPlayer?: Record<string, string[]>;
    /** Frozen Quest Prep picks by character id. */
    questAbilityLoadoutsByCharacterId?: Record<string, string[]>;
    setLocalOverride?: (path: string, value: unknown) => void;
    removeLocalOverride?: (path: string) => void;
    onPhaseChange?: (phase: string, gameState: Record<string, unknown>) => void;
    /** Header slot content, forwarded from GameScreen via Game.tsx. */
    headerSlot?: React.ReactNode;
    /** Right column slot content (chat), forwarded from GameScreen via Game.tsx. */
    chatSlot?: React.ReactNode;
    /** Loading/resync overlay, forwarded from GameScreen via Game.tsx. */
    centerOverlay?: React.ReactNode;
}

function isQuestPrepMode(
    questLobbyFields: QuestLobbyFields | null | undefined,
    character: CampaignCharacter | null,
): boolean {
    if (!questLobbyFields) return false;
    const run = character?.activeQuestRun;
    if (run?.status === 'prep' && run.questDefId === questLobbyFields.questDefId) return true;
    // Joiner on first mission before they have a local prep run.
    if (
        questLobbyFields.questSlotIndex === 0
        && (!run || run.questDefId !== questLobbyFields.questDefId || run.status === 'prep')
    ) {
        return true;
    }
    return false;
}

function QuestPrepCenter({
    useLayoutSlots,
    onChangeCharacter,
}: {
    useLayoutSlots: boolean;
    onChangeCharacter: () => void;
}) {
    const loadout = useQuestPrepLoadoutContext();
    return (
        <QuestPrepOverview
            character={loadout.character}
            onChangeCharacter={onChangeCharacter}
            useLayoutSlots={useLayoutSlots}
            selectableIds={loadout.selectableIds}
            selectedPrimaryIds={loadout.selectedPrimaryIds}
            slotsFull={loadout.slotsFull}
            onAdd={loadout.addAbility}
        />
    );
}

function QuestPrepBottomRow() {
    const loadout = useQuestPrepLoadoutContext();
    return (
        <QuestPrepAbilitySlotBar
            character={loadout.character}
            selectedPrimaryIds={loadout.selectedPrimaryIds}
            onRemove={loadout.removeAbility}
        />
    );
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
    questLobbyFields = null,
    questPrepLoadoutsByPlayer = {},
    questAbilityLoadoutsByCharacterId = {},
    setLocalOverride,
    removeLocalOverride,
    onPhaseChange,
    headerSlot,
    chatSlot,
    centerOverlay,
}: CharacterSelectPhaseProps) {
    const { isAdmin, role } = useCurrentUser();
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

    const {
        mySelection, characterToEdit, editorOpen, setEditorOpen, editorForceEditable, setEditorForceEditable,
        creatorOpen, setCreatorOpen, createCardRef, setCreateCardRef,
        activeTab, setActiveTab, view, setView, campaign,
        charactersLoading, myLockedCharacterId, sortedCharacters, missionTraitFilter,
        resolvedRequiredPlayers, controlSelectionsByGroup,
        effectivelyReady, setReadyLoading, allRequiredPlayersPresent, allSelected, allReady, atLeastOneCharacter,
    } = state;

    const inQuestPrep = useMemo(
        () => isQuestPrepMode(questLobbyFields, characterToEdit),
        [questLobbyFields, characterToEdit],
    );

    const localPrimariesRef = useRef<string[]>(questPrepLoadoutsByPlayer[playerId] ?? []);
    const onSelectedPrimaryIdsChange = useCallback((ids: string[]) => {
        localPrimariesRef.current = ids;
    }, []);

    const phase = useCharacterSelectPhase({
        api,
        state,
        characterSelections,
        onPhaseChange,
        isHost,
        preMissionStory,
        missionDef,
        onBeforeReady: inQuestPrep && questLobbyFields && characterToEdit
            ? async () => {
                const primaries = localPrimariesRef.current;
                const partyRoster = buildPartyRosterFromLobby(players, characterSelections);
                // Ensure local selection is in the roster even if name race.
                if (
                    mySelection
                    && mySelection !== SPECTATOR_ID
                    && !isControlEnemy(mySelection)
                    && user?.name
                    && !partyRoster.some((e) => e.characterId === mySelection)
                ) {
                    partyRoster.push({ playerName: user.name, characterId: mySelection });
                }
                const frozen = freezeQuestPrepForCharacter({
                    existingRun: characterToEdit.activeQuestRun,
                    lobby: questLobbyFields,
                    character: {
                        id: characterToEdit.id,
                        equipment: characterToEdit.equipment,
                    },
                    selectedAbilityIds: primaries,
                    partyRoster,
                    assignedBankId: characterToEdit.activeQuestRun?.assignedBankId ?? null,
                });
                await api.updateCharacter(characterToEdit.id, { activeQuestRun: frozen });
                // Keep lobby loadout maps in sync for battle filter (+ continue lobbies).
                await api.updateGameState({
                    questPrepLoadoutsByPlayer: {
                        ...questPrepLoadoutsByPlayer,
                        [playerId]: [...primaries],
                    },
                    questAbilityLoadoutsByCharacterId: {
                        ...questAbilityLoadoutsByCharacterId,
                        [characterToEdit.id]: [...primaries],
                    },
                });
            }
            : undefined,
    });

    const readyPlayerIdsForStatuses = effectivelyReady && !characterSelectReadyPlayerIds.includes(playerId)
        ? [...characterSelectReadyPlayerIds, playerId]
        : characterSelectReadyPlayerIds;

    /** Desktop GameScreen unified branch passes slots; mobile/classic keep bottom PlayerList instead. */
    const useUnifiedSlotShell = headerSlot != null || chatSlot != null;

    const isLoadoutOverview =
        view === 'overview'
        && !!characterToEdit
        && !!mySelection
        && mySelection !== SPECTATOR_ID
        && !isControlEnemy(mySelection)
        && !(editorOpen && characterToEdit)
        && !(activeTab === 'players' && isAdmin)
        && !(activeTab === 'replay' && isAdmin);

    const showAdminTabs = isAdmin && !(editorOpen && characterToEdit);

    const adminTabsCorner = showAdminTabs ? (
        <CharacterSelectAdminTabsCorner
            activeTab={activeTab}
            setActiveTab={setActiveTab}
        />
    ) : undefined;

    const body = (
        <>
            <CharacterSelectHeader
                activeTab={activeTab}
                isAdmin={isAdmin}
                editorOpen={editorOpen}
                characterToEdit={characterToEdit}
                view={view}
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
            ) : isLoadoutOverview && characterToEdit && inQuestPrep ? (
                <QuestPrepCenter
                    useLayoutSlots={useUnifiedSlotShell}
                    onChangeCharacter={() => setView('grid')}
                />
            ) : isLoadoutOverview && characterToEdit ? (
                <CharacterOverview
                    character={characterToEdit}
                    onChangeCharacter={() => setView('grid')}
                    useLayoutSlots={useUnifiedSlotShell}
                />
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
                    playerControl={missionDef?.playerControl}
                    role={role}
                    controlSelectionsByGroup={controlSelectionsByGroup}
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
                view={view}
                editorOpen={editorOpen}
                isAdmin={isAdmin}
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
        </>
    );

    if (useUnifiedSlotShell) {
        const layout = (
            <CharacterSelectLayout
                headerSlot={headerSlot}
                chatSlot={chatSlot}
                centerOverlay={centerOverlay}
                leftColumn={
                    <ColumnSlotPlayerStatuses
                        players={players}
                        currentPlayerId={playerId}
                        characterSelections={characterSelections}
                        readyPlayerIds={readyPlayerIdsForStatuses}
                    />
                }
                bottomLeftCorner={
                    isLoadoutOverview && characterToEdit ? (
                        <CharacterSelectCornerPortrait
                            character={characterToEdit}
                            onChangeCharacter={() => setView('grid')}
                        />
                    ) : undefined
                }
                bottomRow={
                    isLoadoutOverview && characterToEdit && inQuestPrep ? (
                        <QuestPrepBottomRow />
                    ) : isLoadoutOverview && characterToEdit ? (
                        <CharacterSelectBottomAbilityList character={characterToEdit} />
                    ) : undefined
                }
                bottomRightCorner={adminTabsCorner}
            >
                {body}
            </CharacterSelectLayout>
        );

        if (isLoadoutOverview && characterToEdit && inQuestPrep) {
            return (
                <QuestPrepLoadoutProvider
                    api={api}
                    playerId={playerId}
                    character={characterToEdit}
                    questPrepLoadoutsByPlayer={questPrepLoadoutsByPlayer}
                    onSelectedPrimaryIdsChange={onSelectedPrimaryIdsChange}
                >
                    {layout}
                </QuestPrepLoadoutProvider>
            );
        }
        return layout;
    }

    const classic = (
        <div className="w-full h-full flex flex-col max-w-[1200px] mx-auto">
            {body}
            {isLoadoutOverview && characterToEdit && inQuestPrep && (
                <div className="shrink-0 px-5 pb-4" style={{ minHeight: 120 }}>
                    <QuestPrepBottomRow />
                </div>
            )}
            {adminTabsCorner && (
                <div className="shrink-0 px-5 pb-4 flex justify-end">
                    <div className="w-full max-w-[200px]">
                        {adminTabsCorner}
                    </div>
                </div>
            )}
        </div>
    );

    if (isLoadoutOverview && characterToEdit && inQuestPrep) {
        return (
            <QuestPrepLoadoutProvider
                api={api}
                playerId={playerId}
                character={characterToEdit}
                questPrepLoadoutsByPlayer={questPrepLoadoutsByPlayer}
                onSelectedPrimaryIdsChange={onSelectedPrimaryIdsChange}
            >
                {classic}
            </QuestPrepLoadoutProvider>
        );
    }
    return classic;
}
