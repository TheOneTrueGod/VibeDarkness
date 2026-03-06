/**
 * Character Select Phase - React component
 * Shows "Create Character" card (top left) and list of player's campaign characters.
 * Characters sorted by whether they can be used on the current campaign/mission.
 * Disallow reason shown diagonally on cards when they cannot be used.
 */
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import type { PlayerState } from '../../../types';
import { LobbyClient } from '../../../LobbyClient';
import { MessageType } from '../../../MessageTypes';
import { MinionBattlesPlayer } from '../MinionBattlesPlayer';
import type { PreMissionStoryDef } from '../storylines/storyTypes';
import type { IBaseMissionDef } from '../storylines/BaseMissionDef';
import { fromCampaignCharacterData, type CampaignCharacter } from '../character_defs/CampaignCharacter';
import type { CampaignCharacterData } from '../character_defs/campaignCharacterTypes';
import { getPortrait } from '../character_defs/portraits';
import CharacterCreator from '../components/CharacterCreator';

interface CharacterSelectPhaseProps {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
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
    players,
    characterSelections,
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

    const handleStartGame = useCallback(async () => {
        try {
            const newGameState = await lobbyClient.updateGameState(lobbyId, gameId, playerId, {
                gamePhase: 'battle',
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

    const handleContinueToStory = useCallback(async () => {
        try {
            const newGameState = await lobbyClient.updateGameState(lobbyId, gameId, playerId, {
                gamePhase: 'pre_mission_story',
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

    const createCharacterApi = useCallback(
        async (payload: { portraitId: string; campaignId: string; missionId: string }) => {
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

    return (
        <div className="w-full h-full flex flex-col max-w-[1200px] mx-auto">
            <h2 className="text-[32px] font-bold text-center py-5 shrink-0">Select your character</h2>

            <div className="flex-1 overflow-auto px-5 pb-5">
                <div className="flex flex-wrap justify-center gap-6">
                    {/* Create Character card - top left (first in list) */}
                    <CreateCharacterCard
                        ref={setCreateCardRef}
                        onClick={() => setCreatorOpen(true)}
                    />
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
                            />
                        ))
                    )}
                </div>
            </div>

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

            {(isHost || (preMissionStory && allSelected)) && (
                <div className="flex justify-center py-4 px-5 shrink-0 border-t border-border-custom">
                    {allSelected && preMissionStory ? (
                        isHost ? (
                            <button
                                type="button"
                                className="px-8 py-3 text-white text-lg font-bold rounded-lg bg-primary hover:opacity-90 shadow-lg cursor-pointer"
                                onClick={handleContinueToStory}
                            >
                                Continue
                            </button>
                        ) : (
                            <p className="text-muted">Waiting for host to continue...</p>
                        )
                    ) : isHost ? (
                        <button
                            type="button"
                            disabled={!allSelected}
                            className={`px-8 py-3 text-white text-lg font-bold rounded-lg transition-colors shadow-lg ${
                                allSelected
                                    ? 'bg-green-600 hover:bg-green-700 hover:shadow-xl cursor-pointer'
                                    : 'bg-gray-600 opacity-50 cursor-not-allowed'
                            }`}
                            onClick={handleStartGame}
                        >
                            Start Game
                        </button>
                    ) : null}
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
}: CampaignCharacterCardProps) {
    const portrait = getPortrait(character.portraitId);
    const displayName = portrait?.name ?? 'Character';
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
