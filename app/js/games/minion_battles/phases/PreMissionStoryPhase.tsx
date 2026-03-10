/**
 * Pre-mission story phase - visual novel style segment.
 * Each player advances at their own pace (local phrase index). Only choice results are sent to the server.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { PlayerState } from '../../../types';
import { LobbyClient } from '../../../LobbyClient';
import { MessageType } from '../../../MessageTypes';
import { getNpc } from '../constants/npcs';
import type {
    PreMissionStoryDef,
    DialoguePhrase,
    ChoicePhrase,
    GrantEquipmentRandomPhrase,
    GroupVotePhrase,
    PreMissionPhrase,
} from '../storylines/storyTypes';
import { getItemDef } from '../character_defs/items';
import VNTextBox from '../components/VNTextBox';
import CharacterPortrait from '../components/CharacterPortrait';
import StoryTextEffect from '../components/StoryTextEffect';

interface PreMissionStoryPhaseProps {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    /** Mission ID for this story; used for deterministic equipment grants. */
    missionId: string;
    players: Record<string, PlayerState>;
    preMissionStory: PreMissionStoryDef;
    /** Player IDs that have reached the final "start game" card (synced from server). */
    storyReadyPlayerIds: string[];
    /** Current equipment per player (from server); used to compute replaceItemIds when equipping. */
    playerEquipmentByPlayer?: Record<string, string[]>;
    /** Votes per group vote (voteId -> playerId -> optionId); synced from server. */
    groupVoteVotes?: Record<string, Record<string, string>>;
    onPhaseChange?: (phase: string, gameState: Record<string, unknown>) => void;
}

function isDialogue(phrase: PreMissionPhrase | undefined): phrase is DialoguePhrase {
    return !!phrase && phrase.type === 'dialogue';
}

function isChoice(phrase: PreMissionPhrase | undefined): phrase is ChoicePhrase {
    return phrase?.type === 'choice';
}

function isGrantEquipmentRandom(phrase: PreMissionPhrase | undefined): phrase is GrantEquipmentRandomPhrase {
    return phrase?.type === 'grant_equipment_random';
}

function isGroupVote(phrase: PreMissionPhrase | undefined): phrase is GroupVotePhrase {
    return phrase?.type === 'groupVote';
}

export default function PreMissionStoryPhase({
    lobbyClient,
    lobbyId,
    gameId,
    playerId,
    isHost,
    missionId,
    players,
    preMissionStory,
    storyReadyPlayerIds,
    playerEquipmentByPlayer,
    groupVoteVotes = {},
    onPhaseChange,
}: PreMissionStoryPhaseProps) {
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [backgroundImage, setBackgroundImage] = useState<string | undefined>();
    const [bgOpacity, setBgOpacity] = useState(1);
    const [isApplyingGroupVote, setIsApplyingGroupVote] = useState(false);

    const phrases: PreMissionPhrase[] = preMissionStory.phrases;
    const currentPhrase = phrases[phraseIndex];
    const isEnd = phraseIndex >= phrases.length;

    // When this player reaches the end, notify the server so the host can gate "Start Game".
    useEffect(() => {
        if (!isEnd) return;
        lobbyClient.sendMessage(lobbyId, playerId, MessageType.STORY_READY, {}).catch(() => {});
    }, [isEnd, lobbyClient, lobbyId, playerId]);

    useEffect(() => {
        if (currentPhrase && isDialogue(currentPhrase) && currentPhrase.backgroundImage) {
            setBackgroundImage(currentPhrase.backgroundImage);
            setBgOpacity(0);
            requestAnimationFrame(() => setBgOpacity(1));
        }
    }, [phraseIndex, currentPhrase]);

    const advancePhrase = useCallback(() => {
        setPhraseIndex((i) => Math.min(i + 1, phrases.length));
    }, [phrases.length]);

    // Ensure we only send a grant-equipment message once per phrase index.
    const lastGrantIndexRef = useRef<number | null>(null);

    // Host applies grant_equipment_random phrases by sending a one-off message to the server.
    useEffect(() => {
        if (!isHost) {
            // Non-host clients just advance past grant-equipment phrases locally; the server
            // will apply the effect using the host's message and everyone will see it via polling.
            if (isGrantEquipmentRandom(currentPhrase)) {
                advancePhrase();
            }
            return;
        }
        if (!isGrantEquipmentRandom(currentPhrase)) {
            return;
        }
        if (lastGrantIndexRef.current === phraseIndex) {
            return;
        }
        lastGrantIndexRef.current = phraseIndex;
        const { itemId, seedSuffix } = currentPhrase;
        void lobbyClient
            .sendMessage(lobbyId, playerId, MessageType.STORY_GRANT_EQUIPMENT_RANDOM, {
                missionId,
                phraseIndex,
                itemId,
                ...(seedSuffix ? { seedSuffix } : {}),
            })
            .catch(() => {
                // Swallow errors; the story can still progress, but the grant may fail.
            })
            .finally(() => {
                advancePhrase();
            });
    }, [advancePhrase, currentPhrase, isHost, lobbyClient, lobbyId, missionId, phraseIndex, playerId]);

    const handleStartGame = useCallback(async () => {
        try {
            const newGameState = await lobbyClient.updateGameState(lobbyId, gameId, playerId, {
                gamePhase: 'battle',
            });
            await lobbyClient.sendMessage(lobbyId, playerId, MessageType.GAME_PHASE_CHANGED, {
                gamePhase: 'battle',
            });
            onPhaseChange?.('battle', newGameState as Record<string, unknown>);
        } catch (error) {
            console.error('Failed to start game:', error);
        }
    }, [lobbyClient, lobbyId, gameId, playerId, onPhaseChange]);

    const handleChoice = useCallback(
        async (choiceId: string, optionId: string, option?: { action?: { type: string; itemId?: string } }) => {
            try {
                const currentEquipment = playerEquipmentByPlayer?.[playerId] ?? [];
                let itemId: string | undefined;
                let replaceItemIds: string[] = [];
                if (option?.action?.type === 'equip_item' && option.action.itemId) {
                    itemId = option.action.itemId;
                    const newItemDef = getItemDef(itemId);
                    const newSlots = new Set(newItemDef?.slots ?? []);
                    if (newSlots.size > 0) {
                        for (const equippedId of currentEquipment) {
                            const equippedDef = getItemDef(equippedId);
                            if (equippedDef?.slots.some((s) => newSlots.has(s))) {
                                replaceItemIds.push(equippedId);
                            }
                        }
                    }
                }
                await lobbyClient.sendMessage(lobbyId, playerId, MessageType.STORY_CHOICE, {
                    choiceId,
                    optionId,
                    ...(itemId !== undefined && { itemId, replaceItemIds }),
                });
            } catch (error) {
                console.error('Failed to send story choice:', error);
            }
            advancePhrase();
        },
        [lobbyClient, lobbyId, playerId, playerEquipmentByPlayer, advancePhrase]
    );

    const handleGroupVote = useCallback(
        async (voteId: string, optionId: string) => {
            try {
                await lobbyClient.sendMessage(lobbyId, playerId, MessageType.STORY_GROUP_VOTE, {
                    voteId,
                    phraseIndex,
                    optionId,
                });
            } catch (error) {
                console.error('Failed to send group vote:', error);
            }
        },
        [lobbyClient, lobbyId, playerId, phraseIndex]
    );

    const handleGroupVoteNext = useCallback(async () => {
        if (!currentPhrase || !isGroupVote(currentPhrase)) return;
        setIsApplyingGroupVote(true);
        try {
            if (isHost && currentPhrase.effect) {
                await lobbyClient.sendMessage(lobbyId, playerId, MessageType.STORY_GROUP_VOTE_APPLY, {
                    voteId: currentPhrase.voteId,
                    phraseIndex,
                    effect: currentPhrase.effect,
                });
            }
            advancePhrase();
        } catch (error) {
            console.error('Failed to apply group vote:', error);
        } finally {
            setIsApplyingGroupVote(false);
        }
    }, [currentPhrase, isHost, lobbyClient, lobbyId, playerId, phraseIndex, advancePhrase]);

    const allPlayerIds = Object.keys(players);
    const singlePlayer = allPlayerIds.length === 1;
    const allReady =
        allPlayerIds.length > 0 &&
        (singlePlayer || allPlayerIds.every((id) => storyReadyPlayerIds.includes(id)));
    const hostCanStart = isHost && allReady;

    if (isEnd) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-surface">
                {isHost ? (
                    <div className="flex flex-col items-center gap-2">
                        <button
                            type="button"
                            onClick={handleStartGame}
                            disabled={!hostCanStart}
                            className="px-8 py-3 text-white text-lg font-bold rounded-lg bg-green-600 hover:bg-green-700 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
                        >
                            Start Game
                        </button>
                        {!hostCanStart && !singlePlayer && (
                            <p className="text-muted text-lg">Waiting for players</p>
                        )}
                    </div>
                ) : (
                    <p className="text-muted text-lg">Waiting for host</p>
                )}
            </div>
        );
    }

    if (!currentPhrase) {
        return null;
    }

    const showBackground = isDialogue(currentPhrase) && currentPhrase.backgroundImage;
    if (showBackground && currentPhrase.backgroundImage !== backgroundImage) {
        setBackgroundImage(currentPhrase.backgroundImage);
    }

    const isTitleEffect = isDialogue(currentPhrase) && currentPhrase.textEffect === 'title_bounce';

    return (
        <div className="w-full h-full flex flex-col overflow-hidden bg-black relative">
            {/* Background image: top 80% only so bottom sits ~20% into the text box area */}
            {backgroundImage && (
                <div
                    className="absolute inset-0 bg-cover bg-center transition-opacity duration-500 z-0"
                    style={{ backgroundImage: `url(${backgroundImage})`, opacity: bgOpacity }}
                />
            )}
            <div className="relative z-10 flex-1 flex flex-col min-h-0 justify-end items-center">
                {/* Content constrained to max-width for narrator text boxes & images */}
                <div className="w-full max-w-[1200px] flex flex-col flex-1 min-h-0 justify-end mx-auto px-6">
                    {/* Portrait row: when dialogue (including textEffect phrases) */}
                    {isDialogue(currentPhrase) && (
                        <div className="flex shrink-0 justify-between gap-4 pt-4 pb-0 h-[140px] items-end">
                            <div className="flex gap-2 items-end">
                                {(currentPhrase.portraits?.left ?? (currentPhrase.speakerId ? [currentPhrase.speakerId] : [])).slice(0, 2).map((npcId) => {
                                    const npc = getNpc(npcId);
                                    const isActive = currentPhrase.speakerId === npcId;
                                    return npc?.portrait ? (
                                        <CharacterPortrait
                                            key={npcId}
                                            picture={npc.portrait}
                                            size="large"
                                            className={`border-2 flex-shrink-0 ${isActive ? 'border-primary shadow-lg' : 'border-border-custom opacity-70'}`}
                                        />
                                    ) : (
                                        <div
                                            key={npcId}
                                            className="rounded-lg border-2 border-border-custom w-24 h-24 shrink-0 opacity-70"
                                            style={{ backgroundColor: npc?.color ?? '#333' }}
                                        />
                                    );
                                })}
                            </div>
                            <div className="flex gap-2 items-end">
                                {(currentPhrase.portraits?.right ?? []).slice(0, 2).map((npcId) => {
                                    const npc = getNpc(npcId);
                                    const isActive = currentPhrase.speakerId === npcId;
                                    return npc?.portrait ? (
                                        <CharacterPortrait
                                            key={npcId}
                                            picture={npc.portrait}
                                            size="small"
                                            className={`border-2 flex-shrink-0 ${isActive ? 'border-primary shadow-lg' : 'border-border-custom opacity-70'}`}
                                        />
                                    ) : (
                                        <div
                                            key={npcId}
                                            className="rounded-lg border-2 border-border-custom w-24 h-24 shrink-0 opacity-70"
                                            style={{ backgroundColor: npc?.color ?? '#333' }}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Dialogue: text box. Choice: separate card above where text box would be; text box hidden. */}
                    <div className="shrink-0 pb-6 flex flex-col gap-4">
                        {isDialogue(currentPhrase) ? (
                            <VNTextBox
                                title={getNpc(currentPhrase.speakerId)?.name ?? 'Unknown'}
                                titleColor={getNpc(currentPhrase.speakerId)?.color ?? '#ffffff'}
                                actions={
                                    <button
                                        type="button"
                                        onClick={advancePhrase}
                                        className="px-6 py-2 bg-primary text-white font-semibold rounded-lg hover:opacity-90"
                                    >
                                        Next
                                    </button>
                                }
                            >
                                {isTitleEffect ? (
                                    <StoryTextEffect effect="title_bounce" text={currentPhrase.text} />
                                ) : (
                                    <p className="mb-0">{currentPhrase.text}</p>
                                )}
                            </VNTextBox>
                        ) : isChoice(currentPhrase) ? (
                            <>
                                <div className="border-2 border-border-custom rounded-lg bg-surface-light shadow-lg overflow-hidden p-6">
                                    <div className="space-y-3">
                                        {currentPhrase.options.map((opt) => (
                                            <button
                                                key={opt.id}
                                                type="button"
                                                onClick={() => handleChoice(currentPhrase.choiceId, opt.id, opt)}
                                                className="block w-full text-left px-6 py-4 rounded-lg border-2 border-border-custom bg-surface hover:border-primary hover:bg-surface-light/80 transition-colors text-lg text-white"
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {/* Spacer so choice card sits above where the text box would be */}
                                <div className="min-h-[16rem]" aria-hidden />
                            </>
                        ) : isGroupVote(currentPhrase) ? (
                            (() => {
                                const voteId = currentPhrase.voteId;
                                const options =
                                    currentPhrase.optionSource === 'players'
                                        ? allPlayerIds.map((id) => ({
                                              id,
                                              label: players[id]?.name ?? id,
                                          }))
                                        : currentPhrase.options ?? [];
                                const votesForVote = groupVoteVotes[voteId] ?? {};
                                const myVote = votesForVote[playerId];
                                const allVoted = allPlayerIds.every((pid) => votesForVote[pid] != null);
                                const voterNames = (optionId: string) =>
                                    allPlayerIds
                                        .filter((pid) => votesForVote[pid] === optionId)
                                        .map((pid) => players[pid]?.name ?? pid)
                                        .join(', ');
                                return (
                                    <>
                                        <div className="border-2 border-border-custom rounded-lg bg-surface-light shadow-lg overflow-hidden p-6">
                                            <p className="text-white mb-4">{currentPhrase.text}</p>
                                            <div className="space-y-3">
                                                {options.map((opt) => {
                                                    const voters = voterNames(opt.id);
                                                    const isMyVote = myVote === opt.id;
                                                    return (
                                                        <div
                                                            key={opt.id}
                                                            className="rounded-lg border-2 border-border-custom bg-surface overflow-hidden"
                                                        >
                                                            <div className="flex items-center gap-3 px-4 py-3">
                                                                {myVote == null ? (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            handleGroupVote(voteId, opt.id)
                                                                        }
                                                                        className="flex-1 text-left px-2 py-2 rounded-lg text-lg text-white hover:bg-surface-light/80 transition-colors"
                                                                    >
                                                                        {opt.label}
                                                                    </button>
                                                                ) : (
                                                                    <span
                                                                        className={`flex-1 text-lg text-white ${
                                                                            isMyVote ? 'font-semibold' : ''
                                                                        }`}
                                                                    >
                                                                        {opt.label}
                                                                        {isMyVote && (
                                                                            <span className="text-primary ml-2">
                                                                                (your vote)
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                )}
                                                                {voters ? (
                                                                    <span className="text-sm text-muted shrink-0">
                                                                        {voters}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            {allVoted && (
                                                <div className="mt-4 flex justify-end items-center gap-2">
                                                    {isApplyingGroupVote && (
                                                        <svg
                                                            className="animate-spin h-5 w-5 text-primary"
                                                            xmlns="http://www.w3.org/2000/svg"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            aria-hidden
                                                        >
                                                            <circle
                                                                className="opacity-25"
                                                                cx="12"
                                                                cy="12"
                                                                r="10"
                                                                stroke="currentColor"
                                                                strokeWidth="4"
                                                            />
                                                            <path
                                                                className="opacity-75"
                                                                fill="currentColor"
                                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                            />
                                                        </svg>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={handleGroupVoteNext}
                                                        disabled={isApplyingGroupVote}
                                                        className="px-6 py-2 bg-primary text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {isApplyingGroupVote ? 'Applying…' : 'Next'}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-h-[16rem]" aria-hidden />
                                    </>
                                );
                            })()
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
