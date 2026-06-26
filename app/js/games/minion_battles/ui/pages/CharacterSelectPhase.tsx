/**
 * Character Select Phase - React component
 * Shows "Create Character" card (top left) and list of player's campaign characters.
 * Characters sorted by server `lastUsed` (most recent mission first), then mission eligibility.
 * Disallow reason shown diagonally on cards when they cannot be used.
 */
import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import type { PlayerState } from '../../../../types';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import { MessageType } from '../../../../MessageTypes';
import type { PreMissionStoryDef } from '../../storylines/storyTypes';
import type { IBaseMissionDef } from '../../storylines/BaseMissionDef';
import { fromCampaignCharacterData, type CampaignCharacter } from '../../character_defs/CampaignCharacter';
import { SPECTATOR_ID, CONTROL_ENEMY_ALPHA_WOLF, isControlEnemy } from '../../state';
import type { CampaignCharacterData } from '../../character_defs/campaignCharacterTypes';
import { getPortrait } from '../../character_defs/portraits';
import { ALL_PLAYER_ITEMS } from '../../character_defs/items';
import CharacterCreator from '../components/CharacterEditor/CharacterCreator';
import CharacterEditor from '../components/CharacterEditor/CharacterEditor';
import CharactersPanel from '../components/characters/CharactersPanel';
import ReplayUi from '../../replay/ReplayUi';
import { useCurrentUser } from '../../../../user/useCurrentUser';
import { useUserData } from '../../../../user/UserDataProvider';

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
    // Ensure nullish coalescing and logical OR are not mixed without parentheses.
    const campaignId =
        campaignIdProp || (missionDef?.campaignId ?? missionId);
    const [myCharacters, setMyCharacters] = useState<CampaignCharacter[]>([]);
    const [charactersLoading, setCharactersLoading] = useState(true);
    const [creatorOpen, setCreatorOpen] = useState(false);
    const [createCardRef, setCreateCardRef] = useState<HTMLDivElement | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorForceEditable, setEditorForceEditable] = useState(false);
    const [activeTab, setActiveTab] = useState<'characters' | 'players' | 'replay'>('characters');
    const [campaign, setCampaign] = useState<import('../../../../types').CampaignState | null>(null);
    const [setReadyLoading, setSetReadyLoading] = useState(false);
    /** Optimistic: true after API succeeds, before next poll confirms. Keeps button disabled. */
    const [optimisticAmReady, setOptimisticAmReady] = useState(false);

    const didAutoOpenCreatorForMissionRef = useRef(false);
    const autoSelectAttemptedForMissionRef = useRef(false);

    useEffect(() => {
        didAutoOpenCreatorForMissionRef.current = false;
        autoSelectAttemptedForMissionRef.current = false;
    }, [missionId]);

    useEffect(() => {
        if (!isAdmin && (activeTab === 'players' || activeTab === 'replay')) {
            setActiveTab('characters');
        }
        if (activeTab === 'players' || activeTab === 'replay') {
            setEditorOpen(false);
            setCreatorOpen(false);
        }
    }, [activeTab, isAdmin]);

    useEffect(() => {
        if (!editorOpen || !campaignId) {
            setCampaign(null);
            return;
        }
        let cancelled = false;
        api
            .getCampaign(campaignId)
            .then((c) => {
                if (!cancelled) setCampaign(c);
            })
            .catch(() => {
                if (!cancelled) setCampaign(null);
            });
        return () => {
            cancelled = true;
        };
    }, [campaignId, editorOpen, api]);

    useEffect(() => {
        let cancelled = false;
        api
            .getMyCharacters()
            .then((list) => {
                if (cancelled) return;
                const chars = (list as CampaignCharacterData[]).map((d) => fromCampaignCharacterData(d));
                setMyCharacters(chars);
            })
            .catch(() => {
                if (!cancelled) setMyCharacters([]);
            })
            .finally(() => {
                if (!cancelled) setCharactersLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [api]);

    useEffect(() => {
        if (charactersLoading) return;
        if (myCharacters.length > 0) return;
        if (activeTab === 'players' || editorOpen) return;
        if (didAutoOpenCreatorForMissionRef.current) return;
        didAutoOpenCreatorForMissionRef.current = true;
        setCreatorOpen(true);
    }, [charactersLoading, myCharacters.length, activeTab, editorOpen]);

    const mySelection = characterSelections[playerId] ?? null;
    const allPlayerIds = Object.keys(players);
    const allSelected = allPlayerIds.length > 0 && allPlayerIds.every((pid) => pid in characterSelections);
    const readySet = useMemo(
        () => new Set(characterSelectReadyPlayerIds),
        [characterSelectReadyPlayerIds],
    );

    /** Match each required player to the connected player with the same name (if present). */
    const resolvedRequiredPlayers = useMemo(
        () =>
            requiredPlayers.map((req) => {
                const connectedPlayer = Object.values(players).find((p) => p.name === req.playerName) ?? null;
                return { ...req, connectedPlayer };
            }),
        [requiredPlayers, players],
    );

    /** All required players must be present before the host can start. */
    const allRequiredPlayersPresent =
        resolvedRequiredPlayers.every((r) => r.connectedPlayer !== null);

    /** All players (including spectators) must have clicked Ready. */
    const allReady =
        allPlayerIds.length > 0 && allPlayerIds.every((pid) => readySet.has(pid));
    /** At least one player must have chosen a character (not spectator) to start. */
    const atLeastOneCharacter =
        allPlayerIds.some((pid) => {
            const sel = characterSelections[pid];
            return sel != null && sel !== SPECTATOR_ID;
        });
    const controlEnemySelectedBy = Object.entries(characterSelections).find(
        ([, sel]) => sel === CONTROL_ENEMY_ALPHA_WOLF,
    )?.[0] ?? null;
    const amReady = readySet.has(playerId);
    const effectivelyReady = amReady || optimisticAmReady;

    const missionTraitFilter = useMemo(
        () =>
            missionDef
                ? {
                      allowedTraits: missionDef.allowedTraits,
                      disallowedTraits: missionDef.disallowedTraits,
                  }
                : undefined,
        [missionDef],
    );

    const sortedCharacters = useMemo(() => {
        return [...myCharacters].sort((a, b) => {
            if (b.lastUsed !== a.lastUsed) {
                return b.lastUsed - a.lastUsed;
            }
            const aOk = a.canBeUsedOnMission(campaignId, missionId, missionTraitFilter);
            const bOk = b.canBeUsedOnMission(campaignId, missionId, missionTraitFilter);
            if (aOk && !bOk) return -1;
            if (!aOk && bOk) return 1;
            return 0;
        });
    }, [myCharacters, campaignId, missionId, missionTraitFilter]);

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

    // Check if this player is a required player and get their locked character ID.
    const myRequiredEntry = useMemo(
        () => resolvedRequiredPlayers.find((r) => r.connectedPlayer?.id === playerId) ?? null,
        [resolvedRequiredPlayers, playerId],
    );
    const myLockedCharacterId = myRequiredEntry?.characterId ?? null;

    useEffect(() => {
        if (charactersLoading) return;
        if (autoSelectAttemptedForMissionRef.current) return;
        if (myCharacters.length === 0) return;
        if (mySelection != null) return;
        if (activeTab === 'players' || editorOpen || creatorOpen) return;

        // If I'm a required player, prefer my locked character.
        const requiredChar = myLockedCharacterId
            ? myCharacters.find((c) => c.id === myLockedCharacterId) ?? null
            : null;

        const chosen =
            requiredChar ??
            sortedCharacters.find((c) =>
                c.canBeUsedOnMission(campaignId, missionId, missionTraitFilter),
            ) ??
            sortedCharacters[0];
        if (chosen == null) return;

        autoSelectAttemptedForMissionRef.current = true;
        const portrait = getPortrait(chosen.portraitId);
        const displayName = chosen.name || (portrait?.name ?? 'Character');
        void handleSelectCharacter(chosen.id, chosen.portraitId, displayName).catch(() => {
            autoSelectAttemptedForMissionRef.current = false;
        });
    }, [
        charactersLoading,
        myCharacters,
        sortedCharacters,
        mySelection,
        activeTab,
        editorOpen,
        creatorOpen,
        campaignId,
        missionId,
        missionTraitFilter,
        handleSelectCharacter,
        myLockedCharacterId,
    ]);

    const handleCreateCharacter = useCallback(
        (characterId: string, portraitId: string, characterDisplayName?: string) => {
            setCreatorOpen(false);
            handleSelectCharacter(characterId, portraitId, characterDisplayName);
            setEditorForceEditable(true);
            setEditorOpen(true);
        },
        [handleSelectCharacter],
    );

    const handleSetReady = useCallback(async () => {
        setSetReadyLoading(true);
        try {
            await api.sendMessage(MessageType.CHARACTER_SELECT_READY, {});
            setOptimisticAmReady(true);
        } catch (error) {
            console.error('Failed to set ready:', error);
        } finally {
            setSetReadyLoading(false);
        }
    }, [api]);

    const handleContinueToStory = useCallback(async () => {
        try {
            const newGameState = await api.updateGameState({
                gamePhase: 'pre_mission_story',
                storyReadyPlayerIds: [],
                characterSelectReadyPlayerIds: [],
            });
            await api.sendMessage(MessageType.GAME_PHASE_CHANGED, {
                gamePhase: 'pre_mission_story',
            });
            if (onPhaseChange) {
                const merged = {
                    ...newGameState,
                    characterSelections:
                        (newGameState.characterSelections ?? newGameState.character_selections) ??
                        characterSelections,
                };
                onPhaseChange('pre_mission_story', merged);
            }
        } catch (error) {
            console.error('Failed to continue to story:', error);
        }
    }, [api, onPhaseChange, characterSelections]);

    const handleStartGame = useCallback(async () => {
        try {
            const newGameState = await api.updateGameState({
                gamePhase: 'battle',
                characterSelectReadyPlayerIds: [],
            });
            await api.sendMessage(MessageType.GAME_PHASE_CHANGED, {
                gamePhase: 'battle',
            });
            if (onPhaseChange) {
                const merged = {
                    ...newGameState,
                    characterSelections:
                        (newGameState.characterSelections ?? newGameState.character_selections) ??
                        characterSelections,
                };
                onPhaseChange('battle', merged);
            }
        } catch (error) {
            console.error('Failed to start game:', error);
        }
    }, [api, onPhaseChange, characterSelections]);

    const handleContinueToPostMissionStory = useCallback(async () => {
        try {
            const newGameState = await api.updateGameState({
                gamePhase: 'post_mission_story',
                characterSelectReadyPlayerIds: [],
            });
            await api.sendMessage(MessageType.GAME_PHASE_CHANGED, {
                gamePhase: 'post_mission_story',
            });
            if (onPhaseChange) {
                const merged = {
                    ...newGameState,
                    characterSelections:
                        (newGameState.characterSelections ?? newGameState.character_selections) ??
                        characterSelections,
                };
                onPhaseChange('post_mission_story', merged);
            }
        } catch (error) {
            console.error('Failed to continue to post-mission story:', error);
        }
    }, [api, onPhaseChange, characterSelections]);

    const hasTriggeredAdvanceRef = useRef(false);
    useEffect(() => {
        if (!allReady) {
            hasTriggeredAdvanceRef.current = false;
        }
    }, [allReady]);
    // When all players are ready and at least one has a character, host advances to next phase.
    // Story-only missions can skip battle and jump straight into post-mission story.
    // Required players must also be present.
    useEffect(() => {
        if (!isHost || !allSelected || !allReady || !atLeastOneCharacter || !allRequiredPlayersPresent || hasTriggeredAdvanceRef.current) return;
        hasTriggeredAdvanceRef.current = true;
        if (preMissionStory) {
            handleContinueToStory();
        } else if (missionDef?.skipBattle && missionDef.postMissionStory) {
            handleContinueToPostMissionStory();
        } else {
            handleStartGame();
        }
    }, [
        isHost,
        allSelected,
        allReady,
        atLeastOneCharacter,
        allRequiredPlayersPresent,
        preMissionStory,
        missionDef,
        handleContinueToStory,
        handleContinueToPostMissionStory,
        handleStartGame,
    ]);

    const createCharacterApi = useCallback(
        async (payload: {
            portraitId: string;
            campaignId: string;
            missionId: string;
            name?: string;
        }) => {
            const { character, characters } = await api.createCharacter(payload);
            if (characters && characters.length > 0) {
                const mapped = (characters as CampaignCharacterData[]).map((d) =>
                    fromCampaignCharacterData(d),
                );
                setMyCharacters(mapped);
            }
            return { id: character.id, portraitId: character.portraitId, name: character.name };
        },
        [api],
    );

    const handleDeleteCharacter = useCallback(
        async (characterId: string) => {
            if (!window.confirm('Delete this character? This cannot be undone.')) {
                return;
            }
            try {
                const characters = await api.deleteCharacter(characterId);
                const mapped = (characters as CampaignCharacterData[]).map((d) =>
                    fromCampaignCharacterData(d),
                );
                setMyCharacters(mapped);
            } catch (error) {
                console.error('Failed to delete character:', error);
            }
        },
        [api],
    );

    const characterToEdit = useMemo(
        () => (mySelection ? myCharacters.find((c) => c.id === mySelection) ?? null : null),
        [mySelection, myCharacters],
    );

    const handleEditorSaved = useCallback(() => {
        void api
            .getMyCharacters()
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
    }, [api, characterSelections, playerId]);

    return (
        <div className="w-full h-full flex flex-col max-w-[1200px] mx-auto">
            <h2 className="text-[32px] font-bold text-center py-5 shrink-0">
                {activeTab === 'players' && isAdmin
                    ? 'Players'
                    : editorOpen && characterToEdit
                      ? 'Edit character'
                      : 'Select your character'}
            </h2>

            {(!(editorOpen && characterToEdit) || isAdmin) && (
                <div className="flex gap-2 px-5 pb-4 shrink-0">
                    {!(editorOpen && characterToEdit) && (
                        <button
                            type="button"
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                activeTab === 'characters'
                                    ? 'border-primary bg-surface-light text-white'
                                    : 'border-border-custom bg-surface text-muted hover:text-white hover:border-primary'
                            }`}
                            onClick={() => setActiveTab('characters')}
                        >
                            Characters
                        </button>
                    )}
                    {isAdmin && (
                        <button
                            type="button"
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                activeTab === 'players'
                                    ? 'border-primary bg-surface-light text-white'
                                    : 'border-border-custom bg-surface text-muted hover:text-white hover:border-primary'
                            }`}
                            onClick={() => setActiveTab('players')}
                        >
                            Players
                        </button>
                    )}
                    {isAdmin && (
                        <button
                            type="button"
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                activeTab === 'replay'
                                    ? 'border-primary bg-surface-light text-white'
                                    : 'border-border-custom bg-surface text-muted hover:text-white hover:border-primary'
                            }`}
                            onClick={() => setActiveTab('replay')}
                        >
                            Replay
                        </button>
                    )}
                </div>
            )}

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
                        onSaved={handleEditorSaved}
                        onClose={() => {
                            setEditorOpen(false);
                            setEditorForceEditable(false);
                        }}
                        editMode={isAdmin || editorForceEditable}
                        inventoryItems={isAdmin ? ALL_PLAYER_ITEMS : user?.inventoryItemIds ?? []}
                        showInventoryPanel={
                            (isAdmin ? ALL_PLAYER_ITEMS : user?.inventoryItemIds ?? []).length > 0
                        }
                        account={user}
                        campaign={campaign}
                        equippedItemsDisplay="list"
                        localPlayerId={user?.id}
                    />
                </div>
            ) : (
                <div className="flex-1 overflow-auto px-5 pb-5 pt-4">
                    <div className="grid grid-cols-[repeat(auto-fill,200px)] justify-center gap-6">
                        {charactersLoading ? (
                            <div className="w-[200px] h-[200px] flex items-center justify-center text-gray-400">
                                Loading…
                            </div>
                        ) : myLockedCharacterId ? (
                            // Locked: only show the required character, no switching allowed
                            (() => {
                                const lockedChar = sortedCharacters.find((c) => c.id === myLockedCharacterId);
                                return lockedChar ? (
                                    <CampaignCharacterCard
                                        key={lockedChar.id}
                                        character={lockedChar}
                                        campaignId={campaignId}
                                        missionId={missionId}
                                        missionTraitFilter={missionTraitFilter}
                                        isMySelection={mySelection === lockedChar.id}
                                        isLocked
                                        playerSelections={characterSelections}
                                        players={players}
                                        onSelect={handleSelectCharacter}
                                        onDelete={handleDeleteCharacter}
                                    />
                                ) : null;
                            })()
                        ) : (
                            sortedCharacters.map((char) => (
                                <CampaignCharacterCard
                                    key={char.id}
                                    character={char}
                                    campaignId={campaignId}
                                    missionId={missionId}
                                    missionTraitFilter={missionTraitFilter}
                                    isMySelection={mySelection === char.id}
                                    playerSelections={characterSelections}
                                    players={players}
                                    onSelect={handleSelectCharacter}
                                    onDelete={handleDeleteCharacter}
                                />
                            ))
                        )}
                        {/* Absent required player slots */}
                        {resolvedRequiredPlayers
                            .filter((r) => r.connectedPlayer === null)
                            .map((r) => (
                                <RequiredPlayerSlot key={r.playerName} playerName={r.playerName} />
                            ))}
                        {/* Create Character / Spectator / Control Enemy — hidden when player is locked */}
                        {!myLockedCharacterId && (
                            <>
                                <CreateCharacterCard ref={setCreateCardRef} onClick={() => setCreatorOpen(true)} />
                                <SpectatorCard
                                    isMySelection={mySelection === SPECTATOR_ID}
                                    onSelect={() => handleSelectCharacter(SPECTATOR_ID, '')}
                                />
                                {missionId === 'monster' && isAdmin && (
                                    <ControlEnemyCard
                                        isMySelection={mySelection === CONTROL_ENEMY_ALPHA_WOLF}
                                        isDisabled={controlEnemySelectedBy != null && controlEnemySelectedBy !== playerId}
                                        onSelect={() => handleSelectCharacter(CONTROL_ENEMY_ALPHA_WOLF, '')}
                                    />
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}

            {creatorOpen && (
                <CharacterCreator
                    campaignId={campaignId}
                    missionId={missionId}
                    onCreate={handleCreateCharacter}
                    onClose={() => setCreatorOpen(false)}
                    createCharacter={createCharacterApi}
                    anchorRef={{ current: createCardRef }}
                    localPlayerId={user?.id}
                />
            )}

            {activeTab !== 'players' && (
                <div className="flex justify-center gap-4 py-4 px-5 shrink-0 border-t border-border-custom">
                    {editorOpen ? (
                        <>
                            <button
                                type="button"
                                className="px-6 py-3 text-sm font-medium rounded-lg border border-border-custom bg-surface-light text-white hover:bg-border-custom transition-colors cursor-pointer"
                                onClick={() => setEditorOpen(false)}
                            >
                                Back
                            </button>
                            {mySelection && (
                                <button
                                    type="button"
                                    disabled={effectivelyReady || setReadyLoading}
                                    className={`px-8 py-3 text-lg font-bold rounded-lg transition-colors shadow-lg ${
                                        effectivelyReady || setReadyLoading
                                            ? 'bg-gray-600 text-gray-400 cursor-default'
                                            : 'bg-primary text-secondary hover:opacity-90 cursor-pointer'
                                    }`}
                                    onClick={handleSetReady}
                                >
                                    Ready
                                </button>
                            )}
                        </>
                    ) : (
                        <>
                            {mySelection && mySelection !== SPECTATOR_ID && !isControlEnemy(mySelection) && characterToEdit && (
                                <button
                                    type="button"
                                    className="px-6 py-3 text-sm font-medium rounded-lg border border-border-custom bg-surface-light text-white hover:bg-border-custom transition-colors cursor-pointer"
                                    onClick={() => setEditorOpen(true)}
                                >
                                    Edit Character
                                </button>
                            )}
                            {mySelection && (
                                <button
                                    type="button"
                                    disabled={effectivelyReady || setReadyLoading}
                                    className={`px-8 py-3 text-lg font-bold rounded-lg transition-colors shadow-lg ${
                                        effectivelyReady || setReadyLoading
                                            ? 'bg-gray-600 text-gray-400 cursor-default'
                                            : 'bg-primary text-secondary hover:opacity-90 cursor-pointer'
                                    }`}
                                    onClick={handleSetReady}
                                >
                                    Ready
                                </button>
                            )}
                            {!allRequiredPlayersPresent && (
                                <p className="text-yellow-400/80 py-2 text-sm">
                                    Waiting for{' '}
                                    {resolvedRequiredPlayers
                                        .filter((r) => r.connectedPlayer === null)
                                        .map((r) => r.playerName)
                                        .join(', ')}{' '}
                                    to join…
                                </p>
                            )}
                            {allRequiredPlayersPresent && allSelected && allReady && !atLeastOneCharacter && (
                                <p className="text-muted py-2">At least one player must choose a character to start.</p>
                            )}
                            {allRequiredPlayersPresent && allSelected && allReady && atLeastOneCharacter && (
                                <p className="text-muted py-2">All ready! Proceeding...</p>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

/** Placeholder card for a required player who hasn't joined yet */
function RequiredPlayerSlot({ playerName }: { playerName: string }) {
    return (
        <div
            className="w-[200px] h-[200px] rounded-lg border-2 border-dashed border-yellow-600/50 bg-surface flex flex-col items-center justify-center gap-3 opacity-60"
            title={`Waiting for ${playerName} to join`}
        >
            <svg
                className="w-14 h-14 text-yellow-500/70"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 11c2.21 0 4-1.79 4-4S14.21 3 12 3 8 4.79 8 7s1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
                />
            </svg>
            <span className="text-sm font-semibold text-yellow-300/80">{playerName}</span>
            <span className="text-xs text-yellow-500/60 text-center px-2">Waiting to join…</span>
        </div>
    );
}

/** Spectator card: eye icon, "Spectator" label - watch without playing */
function SpectatorCard({
    isMySelection,
    onSelect,
}: {
    isMySelection: boolean;
    onSelect: () => void;
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            className={`
                w-[200px] h-[200px] rounded-lg border-2 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all
                ${isMySelection
                    ? 'border-primary bg-surface-light shadow-[0_0_12px_rgba(78,205,196,0.4)]'
                    : 'border-border-custom bg-surface hover:border-primary hover:bg-surface-light'
                }
            `}
            onClick={onSelect}
            onKeyDown={(e) => e.key === 'Enter' && onSelect()}
        >
            <svg
                className="w-14 h-14 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
            </svg>
            <span className="text-sm font-semibold text-gray-300">Spectator</span>
            <span className="text-xs text-muted text-center px-2">Watch without playing</span>
        </div>
    );
}

/** Control Enemy card: claw icon, red border - control the Alpha Wolf (mission 004 only) */
function ControlEnemyCard({
    isMySelection,
    isDisabled,
    onSelect,
}: {
    isMySelection: boolean;
    isDisabled: boolean;
    onSelect: () => void;
}) {
    return (
        <div
            role="button"
            tabIndex={0}
            className={`
                w-[200px] h-[200px] rounded-lg border-2 flex flex-col items-center justify-center gap-3 transition-all
                ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                ${isMySelection
                    ? 'border-red-500 bg-red-950/40 shadow-[0_0_12px_rgba(239,68,68,0.4)]'
                    : 'border-red-700/70 bg-surface hover:border-red-500 hover:bg-red-950/20'
                }
            `}
            onClick={() => !isDisabled && onSelect()}
            onKeyDown={(e) => e.key === 'Enter' && !isDisabled && onSelect()}
            title={isDisabled ? 'Another player is controlling the Alpha Wolf' : 'Control the Alpha Wolf'}
        >
            <svg
                className="w-14 h-14 text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                />
            </svg>
            <span className="text-sm font-semibold text-red-300">Control Alpha Wolf</span>
            <span className="text-xs text-red-400/80 text-center px-2">Play as the boss</span>
        </div>
    );
}

/** Create Character card: plus in circle, "Create Character" below */
const CreateCharacterCard = React.forwardRef<
    HTMLDivElement,
    { onClick: () => void }
>(function CreateCharacterCard({ onClick }, ref) {
    return (
        <div
            ref={ref}
            role="button"
            tabIndex={0}
            className="w-[200px] h-[200px] rounded-lg border-2 border-dashed border-border-custom bg-surface flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-primary hover:bg-surface-light transition-all"
            onClick={onClick}
            onKeyDown={(e) => e.key === 'Enter' && onClick()}
        >
            <div className="w-14 h-14 rounded-full border-2 border-gray-400 flex items-center justify-center text-2xl text-gray-400">
                +
            </div>
            <span className="text-sm font-semibold text-gray-300">Create Character</span>
        </div>
    );
});

interface CampaignCharacterCardProps {
    character: CampaignCharacter;
    campaignId: string;
    missionId: string;
    missionTraitFilter: { allowedTraits?: string[]; disallowedTraits?: string[] } | undefined;
    isMySelection: boolean;
    /** When true, this character is required for this session and cannot be changed or deleted. */
    isLocked?: boolean;
    playerSelections: Record<string, string>;
    players: Record<string, PlayerState>;
    onSelect: (characterId: string, portraitId: string, characterDisplayName?: string) => void;
    onDelete: (characterId: string) => void;
}

function CampaignCharacterCard({
    character,
    campaignId,
    missionId,
    missionTraitFilter,
    isMySelection,
    isLocked = false,
    playerSelections,
    players,
    onSelect,
    onDelete,
}: CampaignCharacterCardProps) {
    const portrait = getPortrait(character.portraitId);
    const displayName = character.name || (portrait?.name ?? 'Character');
    const canUse = isLocked || character.canBeUsedOnMission(campaignId, missionId, missionTraitFilter);
    const disallowReason = isLocked ? null : character.getDisallowReason(campaignId, missionId, missionTraitFilter);

    const selectingPlayers = useMemo(() => {
        return Object.entries(playerSelections)
            .filter(([, charId]) => charId === character.id)
            .map(([pid]) => players[pid])
            .filter(Boolean);
    }, [playerSelections, character.id, players]);

    return (
        <div
            className={`
                w-[200px] h-[200px] rounded-lg overflow-hidden relative flex flex-col
                transition-all
                ${isLocked
                    ? 'border-[3px] border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)] cursor-default'
                    : isMySelection
                        ? 'border-[3px] border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)] cursor-pointer'
                        : 'border-2 border-border-custom cursor-pointer'
                }
                ${!isLocked && canUse
                    ? 'hover:-translate-y-1 hover:shadow-[0_8px_16px_rgba(0,0,0,0.4)] hover:border-primary'
                    : !isLocked ? 'opacity-70 cursor-not-allowed' : ''
                }
                bg-surface
            `}
            onClick={() => !isLocked && canUse && onSelect(character.id, character.portraitId, displayName)}
            title={isLocked ? `${displayName} — locked for this mission` : canUse ? displayName : `${displayName} — ${disallowReason ?? 'Not available'}`}
        >
            {!isLocked && (
                <button
                    type="button"
                    className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-red-600/90 hover:bg-red-500 text-white text-sm font-bold flex items-center justify-center shadow-lg cursor-pointer"
                    onClick={(e) => {
                        e.stopPropagation();
                        onDelete(character.id);
                    }}
                    title="Delete character"
                    aria-label="Delete character"
                >
                    ×
                </button>
            )}
            <div className="w-full flex-1 overflow-hidden flex items-center justify-center bg-background relative">
                {portrait?.picture && <img src={portrait.picture} alt="" className="w-full h-full object-cover" />}
            </div>

            {disallowReason != null && (
                <div className="absolute inset-0 bottom-8 flex items-center justify-center pointer-events-none overflow-hidden">
                    <span
                        className="text-yellow-400 font-black text-lg tracking-widest opacity-90 select-none uppercase"
                        style={{ transform: 'rotate(-35deg)' }}
                    >
                        {disallowReason}
                    </span>
                </div>
            )}

            <div className="px-3 py-2 bg-surface-light flex items-center justify-between gap-1">
                <span className="text-sm font-semibold truncate">{displayName}</span>
                {selectingPlayers.length > 0 && (
                    <div className="flex gap-1 shrink-0">
                        {selectingPlayers.map((p) => (
                            <div
                                key={p.id}
                                className="w-4 h-4 rounded-full border border-white/50 shadow-sm"
                                style={{ backgroundColor: p.color }}
                                title={p.name}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
