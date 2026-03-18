/**
 * Character Select Phase - React component
 * Shows "Create Character" card (top left) and list of player's campaign characters.
 * Characters sorted by whether they can be used on the current campaign/mission.
 * Disallow reason shown diagonally on cards when they cannot be used.
 */
import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import type { PlayerState } from '../../../types';
import { LobbyClient } from '../../../LobbyClient';
import { MessageType } from '../../../MessageTypes';
import type { PreMissionStoryDef } from '../storylines/storyTypes';
import type { IBaseMissionDef } from '../storylines/BaseMissionDef';
import { fromCampaignCharacterData, type CampaignCharacter } from '../character_defs/CampaignCharacter';
import type { CampaignCharacterData } from '../character_defs/campaignCharacterTypes';
import { getPortrait } from '../character_defs/portraits';
import CharacterCreator from '../components/CharacterCreator';
import CharacterEditor from '../components/CharacterEditor';
import AdminPlayersPanel from '../components/AdminPlayersPanel';

interface CharacterSelectPhaseProps {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    isAdmin: boolean;
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
    setLocalOverride?: (path: string, value: unknown) => void;
    removeLocalOverride?: (path: string) => void;
    onPhaseChange?: (phase: string, gameState: Record<string, unknown>) => void;
}

export default function CharacterSelectPhase({
    lobbyClient,
    lobbyId,
    gameId,
    playerId,
    isHost,
    isAdmin,
    players,
    characterSelections,
    characterSelectReadyPlayerIds = [],
    missionId = '',
    campaignId: campaignIdProp = '',
    missionDef,
    preMissionStory,
    setLocalOverride,
    removeLocalOverride,
    onPhaseChange,
}: CharacterSelectPhaseProps) {
    // Ensure nullish coalescing and logical OR are not mixed without parentheses.
    const campaignId =
        campaignIdProp || (missionDef?.campaignId ?? missionId);
    const [myCharacters, setMyCharacters] = useState<CampaignCharacter[]>([]);
    const [charactersLoading, setCharactersLoading] = useState(true);
    const [creatorOpen, setCreatorOpen] = useState(false);
    const [createCardRef, setCreateCardRef] = useState<HTMLDivElement | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'characters' | 'players'>('characters');

    useEffect(() => {
        if (!isAdmin && activeTab === 'players') {
            setActiveTab('characters');
        }
        if (activeTab === 'players') {
            setEditorOpen(false);
            setCreatorOpen(false);
        }
    }, [activeTab, isAdmin]);

    useEffect(() => {
        let cancelled = false;
        lobbyClient
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
    }, [lobbyClient]);

    const mySelection = characterSelections[playerId] ?? null;
    const allPlayerIds = Object.keys(players);
    const allSelected = allPlayerIds.length > 0 && allPlayerIds.every((pid) => pid in characterSelections);
    const readySet = useMemo(
        () => new Set(characterSelectReadyPlayerIds),
        [characterSelectReadyPlayerIds],
    );
    const allReady =
        allPlayerIds.length > 0 && allPlayerIds.every((pid) => readySet.has(pid));
    const amReady = readySet.has(playerId);

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
            const aOk = a.canBeUsedOnMission(campaignId, missionId, missionTraitFilter);
            const bOk = b.canBeUsedOnMission(campaignId, missionId, missionTraitFilter);
            if (aOk && !bOk) return -1;
            if (!aOk && bOk) return 1;
            return 0;
        });
    }, [myCharacters, campaignId, missionId, missionTraitFilter]);

    /** Map characterId -> display name (from our characters; others show as "(selected)"). */
    const characterIdToName = useMemo(() => {
        const map: Record<string, string> = {};
        for (const c of myCharacters) {
            const portrait = getPortrait(c.portraitId);
            map[c.id] = c.name || (portrait?.name ?? 'Character');
        }
        return map;
    }, [myCharacters]);

    const handleSelectCharacter = useCallback(
        async (characterId: string, portraitId: string) => {
            const overridePath = `characterSelections.${playerId}`;
            setLocalOverride?.(overridePath, characterId);

            try {
                await lobbyClient.sendMessage(lobbyId, playerId, MessageType.CHARACTER_SELECT, {
                    characterId,
                    portraitId,
                });
            } catch (error) {
                removeLocalOverride?.(overridePath);
                console.error('Failed to select character:', error);
            }
        },
        [lobbyClient, lobbyId, playerId, setLocalOverride, removeLocalOverride],
    );

    const handleCreateCharacter = useCallback(
        (characterId: string, portraitId: string) => {
            setCreatorOpen(false);
            handleSelectCharacter(characterId, portraitId);
        },
        [handleSelectCharacter],
    );

    const handleSetReady = useCallback(async () => {
        try {
            await lobbyClient.sendMessage(lobbyId, playerId, MessageType.CHARACTER_SELECT_READY, {});
        } catch (error) {
            console.error('Failed to set ready:', error);
        }
    }, [lobbyClient, lobbyId, playerId]);

    const handleContinueToStory = useCallback(async () => {
        try {
            const newGameState = await lobbyClient.updateGameState(lobbyId, gameId, playerId, {
                gamePhase: 'pre_mission_story',
                storyReadyPlayerIds: [],
                characterSelectReadyPlayerIds: [],
            });
            await lobbyClient.sendMessage(lobbyId, playerId, MessageType.GAME_PHASE_CHANGED, {
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
    }, [lobbyClient, lobbyId, gameId, playerId, onPhaseChange, characterSelections]);

    const handleStartGame = useCallback(async () => {
        try {
            const newGameState = await lobbyClient.updateGameState(lobbyId, gameId, playerId, {
                gamePhase: 'battle',
                characterSelectReadyPlayerIds: [],
            });
            await lobbyClient.sendMessage(lobbyId, playerId, MessageType.GAME_PHASE_CHANGED, {
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
    }, [lobbyClient, lobbyId, gameId, playerId, onPhaseChange, characterSelections]);

    const hasTriggeredAdvanceRef = useRef(false);
    useEffect(() => {
        if (!allReady) {
            hasTriggeredAdvanceRef.current = false;
        }
    }, [allReady]);
    // When all players are ready, host advances to next phase (pre_mission_story or battle).
    useEffect(() => {
        if (!isHost || !allSelected || !allReady || hasTriggeredAdvanceRef.current) return;
        hasTriggeredAdvanceRef.current = true;
        if (preMissionStory) {
            handleContinueToStory();
        } else {
            handleStartGame();
        }
    }, [isHost, allSelected, allReady, preMissionStory, handleContinueToStory, handleStartGame]);

    const createCharacterApi = useCallback(
        async (payload: {
            portraitId: string;
            campaignId: string;
            missionId: string;
            name?: string;
        }) => {
            const { character, characters } = await lobbyClient.createCharacter(payload);
            if (characters && characters.length > 0) {
                const mapped = (characters as CampaignCharacterData[]).map((d) =>
                    fromCampaignCharacterData(d),
                );
                setMyCharacters(mapped);
            }
            return { id: character.id, portraitId: character.portraitId };
        },
        [lobbyClient],
    );

    const handleDeleteCharacter = useCallback(
        async (characterId: string) => {
            if (!window.confirm('Delete this character? This cannot be undone.')) {
                return;
            }
            try {
                const characters = await lobbyClient.deleteCharacter(characterId);
                const mapped = (characters as CampaignCharacterData[]).map((d) =>
                    fromCampaignCharacterData(d),
                );
                setMyCharacters(mapped);
            } catch (error) {
                console.error('Failed to delete character:', error);
            }
        },
        [lobbyClient],
    );

    const characterToEdit = useMemo(
        () => (mySelection ? myCharacters.find((c) => c.id === mySelection) ?? null : null),
        [mySelection, myCharacters],
    );

    const handleEditorSaved = useCallback(() => {
        lobbyClient.getMyCharacters().then((list) => {
            const chars = (list as CampaignCharacterData[]).map((d) => fromCampaignCharacterData(d));
            setMyCharacters(chars);
        }).catch(() => {});
    }, [lobbyClient]);

    return (
        <div className="w-full h-full flex flex-col max-w-[1200px] mx-auto">
            <h2 className="text-[32px] font-bold text-center py-5 shrink-0">
                {activeTab === 'players' && isAdmin
                    ? 'Players'
                    : editorOpen && characterToEdit
                      ? 'Edit character'
                      : 'Select your character'}
            </h2>

            <div className="flex gap-2 px-5 pb-4 shrink-0">
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
            </div>

            {activeTab === 'players' && isAdmin ? (
                <div className="flex-1 min-h-0 overflow-hidden px-5 pb-4">
                    <AdminPlayersPanel lobbyClient={lobbyClient} players={players} />
                </div>
            ) : editorOpen && characterToEdit ? (
                <div className="flex-1 min-h-0 overflow-hidden px-5 pb-4">
                    <CharacterEditor
                        character={characterToEdit}
                        lobbyClient={lobbyClient}
                        onSaved={handleEditorSaved}
                        onClose={() => setEditorOpen(false)}
                        editMode={isAdmin}
                    />
                </div>
            ) : (
                <div className="flex-1 overflow-auto px-5 pb-5 pt-4">
                    <div className="grid grid-cols-[repeat(auto-fill,200px)] justify-center gap-6">
                        {/* Create Character card - top left (first in list) */}
                        <CreateCharacterCard ref={setCreateCardRef} onClick={() => setCreatorOpen(true)} />
                        {charactersLoading ? (
                            <div className="w-[200px] h-[200px] flex items-center justify-center text-gray-400">
                                Loading…
                            </div>
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
                />
            )}

            {activeTab !== 'players' && (
                <div className="flex justify-center gap-4 py-4 px-5 shrink-0 border-t border-border-custom">
                    {editorOpen ? (
                        <button
                            type="button"
                            className="px-6 py-3 text-sm font-medium rounded-lg border border-border-custom bg-surface-light text-white hover:bg-border-custom transition-colors cursor-pointer"
                            onClick={() => setEditorOpen(false)}
                        >
                            Back
                        </button>
                    ) : (
                        <>
                            {mySelection && characterToEdit && (
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
                                    disabled={amReady}
                                    className={`px-8 py-3 text-lg font-bold rounded-lg transition-colors shadow-lg ${
                                        amReady
                                            ? 'bg-green-600 text-white cursor-default'
                                            : 'bg-primary text-secondary hover:opacity-90 cursor-pointer'
                                    }`}
                                    onClick={handleSetReady}
                                >
                                    {amReady ? 'Ready' : 'Ready'}
                                </button>
                            )}
                            {allSelected && allReady && (
                                <p className="text-muted py-2">All ready! Proceeding...</p>
                            )}
                        </>
                    )}
                </div>
            )}
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
    playerSelections: Record<string, string>;
    players: Record<string, PlayerState>;
    onSelect: (characterId: string, portraitId: string) => void;
    onDelete: (characterId: string) => void;
}

function CampaignCharacterCard({
    character,
    campaignId,
    missionId,
    missionTraitFilter,
    isMySelection,
    playerSelections,
    players,
    onSelect,
    onDelete,
}: CampaignCharacterCardProps) {
    const portrait = getPortrait(character.portraitId);
    const displayName = character.name || (portrait?.name ?? 'Character');
    const canUse = character.canBeUsedOnMission(campaignId, missionId, missionTraitFilter);
    const disallowReason = character.getDisallowReason(campaignId, missionId, missionTraitFilter);

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
                transition-all cursor-pointer
                ${isMySelection
                    ? 'border-[3px] border-green-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]'
                    : 'border-2 border-border-custom'
                }
                ${canUse
                    ? 'hover:-translate-y-1 hover:shadow-[0_8px_16px_rgba(0,0,0,0.4)] hover:border-primary'
                    : 'opacity-70 cursor-not-allowed'
                }
                bg-surface
            `}
            onClick={() => canUse && onSelect(character.id, character.portraitId)}
            title={canUse ? displayName : `${displayName} — ${disallowReason ?? 'Not available'}`}
        >
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
            <div
                className="w-full flex-1 overflow-hidden flex items-center justify-center bg-background relative"
                dangerouslySetInnerHTML={{ __html: portrait?.picture ?? '' }}
            />

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
