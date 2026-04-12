/**
 * Character Select Phase - React component
 * Shows "Create Character" card (top left) and list of player's campaign characters.
 * Characters sorted by whether they can be used on the current campaign/mission.
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
import AdminPlayersPanel from '../components/AdminPlayersPanel';
import { useUser } from '../../../../contexts/UserContext';

interface CharacterSelectPhaseProps {
    api: MinionBattlesApi;
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
    api,
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
    const { user } = useUser();
    // Ensure nullish coalescing and logical OR are not mixed without parentheses.
    const campaignId =
        campaignIdProp || (missionDef?.campaignId ?? missionId);
    const [myCharacters, setMyCharacters] = useState<CampaignCharacter[]>([]);
    const [charactersLoading, setCharactersLoading] = useState(true);
    const [creatorOpen, setCreatorOpen] = useState(false);
    const [createCardRef, setCreateCardRef] = useState<HTMLDivElement | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editorForceEditable, setEditorForceEditable] = useState(false);
    const [activeTab, setActiveTab] = useState<'characters' | 'players'>('characters');
    const [campaign, setCampaign] = useState<import('../../../../types').CampaignState | null>(null);
    const [setReadyLoading, setSetReadyLoading] = useState(false);
    /** Optimistic: true after API succeeds, before next poll confirms. Keeps button disabled. */
    const [optimisticAmReady, setOptimisticAmReady] = useState(false);

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

    const mySelection = characterSelections[playerId] ?? null;
    const allPlayerIds = Object.keys(players);
    const allSelected = allPlayerIds.length > 0 && allPlayerIds.every((pid) => pid in characterSelections);
    const readySet = useMemo(
        () => new Set(characterSelectReadyPlayerIds),
        [characterSelectReadyPlayerIds],
    );
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
                await api.sendMessage(MessageType.CHARACTER_SELECT, {
                    characterId,
                    portraitId,
                });
            } catch (error) {
                removeLocalOverride?.(overridePath);
                console.error('Failed to select character:', error);
            }
        },
        [api, playerId, setLocalOverride, removeLocalOverride],
    );

    const handleCreateCharacter = useCallback(
        (characterId: string, portraitId: string) => {
            setCreatorOpen(false);
            handleSelectCharacter(characterId, portraitId);
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

    const hasTriggeredAdvanceRef = useRef(false);
    useEffect(() => {
        if (!allReady) {
            hasTriggeredAdvanceRef.current = false;
        }
    }, [allReady]);
    // When all players are ready and at least one has a character, host advances to next phase (pre_mission_story or battle).
    useEffect(() => {
        if (!isHost || !allSelected || !allReady || !atLeastOneCharacter || hasTriggeredAdvanceRef.current) return;
        hasTriggeredAdvanceRef.current = true;
        if (preMissionStory) {
            handleContinueToStory();
        } else {
            handleStartGame();
        }
    }, [isHost, allSelected, allReady, atLeastOneCharacter, preMissionStory, handleContinueToStory, handleStartGame]);

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
            return { id: character.id, portraitId: character.portraitId };
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
        api.getMyCharacters().then((list) => {
            const chars = (list as CampaignCharacterData[]).map((d) => fromCampaignCharacterData(d));
            setMyCharacters(chars);
        }).catch(() => {});
    }, [api]);

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
                    <AdminPlayersPanel api={api} players={players} />
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
                        account={user}
                        campaign={campaign}
                    />
                </div>
            ) : (
                <div className="flex-1 overflow-auto px-5 pb-5 pt-4">
                    <div className="grid grid-cols-[repeat(auto-fill,200px)] justify-center gap-6">
                        {/* Spectator card - first option */}
                        <SpectatorCard
                            isMySelection={mySelection === SPECTATOR_ID}
                            onSelect={() => handleSelectCharacter(SPECTATOR_ID, '')}
                        />
                        {/* Control Enemy card - mission 004 (Monster) only */}
                        {missionId === 'monster' && (
                            <ControlEnemyCard
                                isMySelection={mySelection === CONTROL_ENEMY_ALPHA_WOLF}
                                isDisabled={controlEnemySelectedBy != null && controlEnemySelectedBy !== playerId}
                                onSelect={() => handleSelectCharacter(CONTROL_ENEMY_ALPHA_WOLF, '')}
                            />
                        )}
                        {/* Create Character card */}
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
                            {allSelected && allReady && !atLeastOneCharacter && (
                                <p className="text-muted py-2">At least one player must choose a character to start.</p>
                            )}
                            {allSelected && allReady && atLeastOneCharacter && (
                                <p className="text-muted py-2">All ready! Proceeding...</p>
                            )}
                        </>
                    )}
                </div>
            )}
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
