/**
 * Character Select Phase - React component
 * Shows "Create Character" card (top left) and list of player's campaign characters.
 * Characters sorted by server `lastUsed` (most recent mission first), then mission eligibility.
 * Disallow reason shown diagonally on cards when they cannot be used.
 * Quest Prep (quest lobby, status prep / first slot) uses dedicated center + bottom segments.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import { CharacterSelectHeader, getCharacterSelectPhaseTitle } from './characterSelect/CharacterSelectHeader';
import { CharacterGrid } from './characterSelect/CharacterGrid';
import { CharacterSelectFooter } from './characterSelect/CharacterSelectFooter';
import CharacterSelectLayout from './characterSelect/CharacterSelectLayout';
import { CharacterSelectCornerPortrait } from './characterSelect/CharacterSelectCornerPortrait';
import { CharacterSelectAdminTabsCorner } from './characterSelect/CharacterSelectAdminTabsCorner';
import ColumnSlotPlayerStatuses from '../../../../components/battleUILayout/ColumnSlotPlayerStatuses';
import HeaderSlotLobbyInfo from '../../../../components/battleUILayout/HeaderSlotLobbyInfo';
import { useDebugConsole } from '../../../../contexts/DebugConsoleContext';
import { QuestPrepOverview } from './characterSelect/questPrep/QuestPrepOverview';
import { QuestPrepAbilitySlotBar } from './characterSelect/questPrep/QuestPrepAbilitySlotBar';
import {
    QuestPrepLoadoutProvider,
    useQuestPrepLoadoutContext,
} from './characterSelect/questPrep/QuestPrepLoadoutContext';
import { MissionPrepOverview } from './characterSelect/missionPrep/MissionPrepOverview';
import {
    MissionPrepLoadoutProvider,
    useMissionPrepLoadoutContext,
} from './characterSelect/missionPrep/MissionPrepLoadoutContext';
import type { CampaignCharacter } from '../../character_defs/CampaignCharacter';
import {
    buildPartyRosterFromLobby,
    freezeQuestPrepForCharacter,
} from '../../storylines/questPrepFinalize';
import { PREP_ABILITY_SLOT_COUNT } from '../../storylines/questPrepLoadout';

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
    /** In-progress Prepare Carefully primary ability picks by player id (regular missions). */
    missionPrepLoadoutsByPlayer?: Record<string, string[]>;
    setLocalOverride?: (path: string, value: unknown) => void;
    removeLocalOverride?: (path: string) => void;
    onPhaseChange?: (phase: string, gameState: Record<string, unknown>) => void;
    /** Lobby id for the unified-shell header badge. */
    lobbyId?: string;
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

function MissionPrepCenter({
    useLayoutSlots,
    onChangeCharacter,
}: {
    useLayoutSlots: boolean;
    onChangeCharacter: () => void;
}) {
    const loadout = useMissionPrepLoadoutContext();
    return (
        <MissionPrepOverview
            character={loadout.character}
            onChangeCharacter={onChangeCharacter}
            useLayoutSlots={useLayoutSlots}
            selectionRequired={loadout.selectionRequired}
            selectableIds={loadout.selectableIds}
            selectedPrimaryIds={loadout.selectedPrimaryIds}
            slotsFull={loadout.slotsFull}
            onAdd={loadout.addAbility}
        />
    );
}

function MissionPrepBottomRow() {
    const loadout = useMissionPrepLoadoutContext();
    const slotCount = loadout.readOnly
        ? Math.max(loadout.selectableIds.length, loadout.selectedPrimaryIds.length)
        : loadout.slotCount;
    return (
        <QuestPrepAbilitySlotBar
            character={loadout.character}
            selectedPrimaryIds={loadout.selectedPrimaryIds}
            slotCount={slotCount > 0 ? slotCount : loadout.slotCount}
            onRemove={loadout.removeAbility}
            readOnly={loadout.readOnly}
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
    missionPrepLoadoutsByPlayer = {},
    setLocalOverride,
    removeLocalOverride,
    onPhaseChange,
    lobbyId = '',
    headerSlot,
    chatSlot,
    centerOverlay,
}: CharacterSelectPhaseProps) {
    const { isAdmin, role } = useCurrentUser();
    const { user } = useUserData();
    const { debugConsoleEnabled } = useDebugConsole();
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
    const inMissionPrep = !inQuestPrep;

    const localPrimariesRef = useRef<string[]>(
        inQuestPrep
            ? (questPrepLoadoutsByPlayer[playerId] ?? [])
            : (missionPrepLoadoutsByPlayer[playerId] ?? []),
    );
    const onSelectedPrimaryIdsChange = useCallback((ids: string[]) => {
        localPrimariesRef.current = ids;
    }, []);

    const [missionAbilityReady, setMissionAbilityReady] = useState(true);
    const onMissionAbilityReadyChange = useCallback((ready: boolean) => {
        setMissionAbilityReady(ready);
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
            : inMissionPrep && characterToEdit
              ? async () => {
                    const primaries = localPrimariesRef.current.slice(0, PREP_ABILITY_SLOT_COUNT);
                    await api.updateGameState({
                        missionPrepLoadoutsByPlayer: {
                            ...missionPrepLoadoutsByPlayer,
                            [playerId]: [...primaries],
                        },
                    });
                    await api.updateCharacter(characterToEdit.id, {
                        lastMissionAbilityIds: [...primaries],
                    });
                }
              : undefined,
    });

    const readyPlayerIdsForStatuses = effectivelyReady && !characterSelectReadyPlayerIds.includes(playerId)
        ? [...characterSelectReadyPlayerIds, playerId]
        : characterSelectReadyPlayerIds;

    /** Desktop GameScreen unified branch passes slots; mobile/classic keep bottom PlayerList instead. */
    const useUnifiedSlotShell = headerSlot != null || chatSlot != null;

    const hasSelectedCharacterLoadout =
        view === 'overview'
        && !!characterToEdit
        && !!mySelection
        && mySelection !== SPECTATOR_ID
        && !isControlEnemy(mySelection)
        && !(activeTab === 'players' && isAdmin)
        && !(activeTab === 'replay' && isAdmin);

    const isLoadoutOverview = hasSelectedCharacterLoadout && !(editorOpen && characterToEdit);
    /** Footer + ability strip in the bottom band (Prepare Carefully and Edit Character). */
    const footerInBottomBand = useUnifiedSlotShell && hasSelectedCharacterLoadout;

    const phaseTitle = getCharacterSelectPhaseTitle({
        activeTab,
        isAdmin,
        editorOpen,
        characterToEdit,
        view,
    });
    const missionName = missionDef?.name ?? missionId;
    const lobbyHeaderTitle = missionName ? `${phaseTitle}: ${missionName}` : phaseTitle;

    const showAdminTabs = isAdmin && !(editorOpen && characterToEdit);

    const adminTabsCorner = showAdminTabs ? (
        <CharacterSelectAdminTabsCorner
            activeTab={activeTab}
            setActiveTab={setActiveTab}
        />
    ) : undefined;

    const footerProps = {
        activeTab,
        view,
        editorOpen,
        isAdmin,
        mySelection,
        effectivelyReady,
        setReadyLoading,
        allRequiredPlayersPresent,
        allSelected,
        allReady,
        atLeastOneCharacter,
        resolvedRequiredPlayers,
        characterToEdit,
        abilityLoadoutReady: !hasSelectedCharacterLoadout || inQuestPrep || missionAbilityReady,
        onSetReady: phase.handleSetReady,
        onOpenEditor: () => setEditorOpen(true),
        onCloseEditor: () => { setEditorOpen(false); setEditorForceEditable(false); },
    } as const;

    const abilityBottomRow =
        hasSelectedCharacterLoadout && characterToEdit && inQuestPrep ? (
            <QuestPrepBottomRow />
        ) : hasSelectedCharacterLoadout && characterToEdit ? (
            <MissionPrepBottomRow />
        ) : null;

    const bottomRowWithActions = footerInBottomBand ? (
        <div className="flex h-full w-full min-h-0 flex-col">
            {/* Equal flex spacers: padding above buttons, between buttons/cards, and below cards */}
            <div className="min-h-0 flex-1" aria-hidden />
            <CharacterSelectFooter {...footerProps} compact />
            <div className="min-h-0 flex-1" aria-hidden />
            <div className="flex shrink-0 justify-center">
                {abilityBottomRow}
            </div>
            <div className="min-h-0 flex-1" aria-hidden />
        </div>
    ) : abilityBottomRow;

    const resolvedHeaderSlot = useUnifiedSlotShell ? (
        <HeaderSlotLobbyInfo
            playerName={players[playerId]?.name ?? ''}
            isHost={isHost}
            isAdmin={isAdmin}
            lobbyName={lobbyHeaderTitle}
            lobbyId={lobbyId}
        />
    ) : headerSlot;

    const body = (
        <>
            <CharacterSelectHeader
                activeTab={activeTab}
                isAdmin={isAdmin}
                editorOpen={editorOpen}
                characterToEdit={characterToEdit}
                view={view}
                titleInLobbyHeader={useUnifiedSlotShell}
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
                        editMode={isAdmin || editorForceEditable || debugConsoleEnabled}
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
                <MissionPrepCenter
                    useLayoutSlots={useUnifiedSlotShell}
                    onChangeCharacter={() => setView('grid')}
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

            {!footerInBottomBand && <CharacterSelectFooter {...footerProps} />}
        </>
    );

    if (useUnifiedSlotShell) {
        const layout = (
            <CharacterSelectLayout
                headerSlot={resolvedHeaderSlot}
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
                    hasSelectedCharacterLoadout && characterToEdit ? (
                        <CharacterSelectCornerPortrait
                            character={characterToEdit}
                            onChangeCharacter={() => setView('grid')}
                        />
                    ) : undefined
                }
                bottomRow={bottomRowWithActions ?? undefined}
                bottomRightCorner={adminTabsCorner}
                compactBottomRow={footerInBottomBand}
            >
                {body}
            </CharacterSelectLayout>
        );

        if (hasSelectedCharacterLoadout && characterToEdit && inQuestPrep) {
            return (
                <QuestPrepLoadoutProvider
                    api={api}
                    playerId={playerId}
                    character={characterToEdit}
                    questPrepLoadoutsByPlayer={questPrepLoadoutsByPlayer}
                    rememberedAbilityIds={questAbilityLoadoutsByCharacterId[characterToEdit.id]}
                    onSelectedPrimaryIdsChange={onSelectedPrimaryIdsChange}
                >
                    {layout}
                </QuestPrepLoadoutProvider>
            );
        }
        if (hasSelectedCharacterLoadout && characterToEdit) {
            return (
                <MissionPrepLoadoutProvider
                    api={api}
                    playerId={playerId}
                    character={characterToEdit}
                    missionPrepLoadoutsByPlayer={missionPrepLoadoutsByPlayer}
                    onSelectedPrimaryIdsChange={onSelectedPrimaryIdsChange}
                    onAbilityReadyChange={onMissionAbilityReadyChange}
                >
                    {layout}
                </MissionPrepLoadoutProvider>
            );
        }
        return layout;
    }

    const classic = (
        <div className="w-full h-full flex flex-col max-w-[1200px] mx-auto">
            {body}
            {hasSelectedCharacterLoadout && characterToEdit && inQuestPrep && (
                <div className="shrink-0 px-5 pb-4" style={{ minHeight: 120 }}>
                    <QuestPrepBottomRow />
                </div>
            )}
            {hasSelectedCharacterLoadout && characterToEdit && !inQuestPrep && (
                <div className="shrink-0 px-5 pb-4" style={{ minHeight: 120 }}>
                    <MissionPrepBottomRow />
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

    if (hasSelectedCharacterLoadout && characterToEdit && inQuestPrep) {
        return (
            <QuestPrepLoadoutProvider
                api={api}
                playerId={playerId}
                character={characterToEdit}
                questPrepLoadoutsByPlayer={questPrepLoadoutsByPlayer}
                rememberedAbilityIds={questAbilityLoadoutsByCharacterId[characterToEdit.id]}
                onSelectedPrimaryIdsChange={onSelectedPrimaryIdsChange}
            >
                {classic}
            </QuestPrepLoadoutProvider>
        );
    }
    if (hasSelectedCharacterLoadout && characterToEdit) {
        return (
            <MissionPrepLoadoutProvider
                api={api}
                playerId={playerId}
                character={characterToEdit}
                missionPrepLoadoutsByPlayer={missionPrepLoadoutsByPlayer}
                onSelectedPrimaryIdsChange={onSelectedPrimaryIdsChange}
                onAbilityReadyChange={onMissionAbilityReadyChange}
            >
                {classic}
            </MissionPrepLoadoutProvider>
        );
    }
    return classic;
}
