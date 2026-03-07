/**
 * Pre-mission story phase - visual novel style segment.
 * Each player advances at their own pace (local phrase index). Only choice results are sent to the server.
 */
import React, { useState, useCallback, useEffect } from 'react';
import type { PlayerState } from '../../../types';
import { LobbyClient } from '../../../LobbyClient';
import { MessageType } from '../../../MessageTypes';
import { getNpc } from '../constants/npcs';
import type { PreMissionStoryDef, DialoguePhrase, ChoicePhrase } from '../storylines/storyTypes';
import { getItemDef } from '../character_defs/items';
import VNTextBox from '../components/VNTextBox';
import CharacterPortrait from '../components/CharacterPortrait';

interface PreMissionStoryPhaseProps {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    preMissionStory: PreMissionStoryDef;
    /** Player IDs that have reached the final "start game" card (synced from server). */
    storyReadyPlayerIds: string[];
    /** Current equipment per player (from server); used to compute replaceItemIds when equipping. */
    playerEquipmentByPlayer?: Record<string, string[]>;
    onPhaseChange?: (phase: string, gameState: Record<string, unknown>) => void;
}

function isDialogue(phrase: DialoguePhrase | ChoicePhrase): phrase is DialoguePhrase {
    return phrase.type === 'dialogue';
}

export default function PreMissionStoryPhase({
    lobbyClient,
    lobbyId,
    gameId,
    playerId,
    isHost,
    players,
    preMissionStory,
    storyReadyPlayerIds,
    playerEquipmentByPlayer,
    onPhaseChange,
}: PreMissionStoryPhaseProps) {
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [backgroundImage, setBackgroundImage] = useState<string | undefined>();
    const [bgOpacity, setBgOpacity] = useState(1);

    const phrases = preMissionStory.phrases;
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

    return (
        <div className="w-full h-full flex flex-col overflow-hidden bg-surface relative">
            {/* Full-screen background image with fade */}
            {backgroundImage && (
                <div
                    className="absolute inset-0 bg-cover bg-center transition-opacity duration-500 z-0"
                    style={{ backgroundImage: `url(${backgroundImage})`, opacity: bgOpacity }}
                />
            )}
            <div className="relative z-10 flex-1 flex flex-col min-h-0 justify-end">
                {/* Portrait row: bottom-aligned to the top of VNTextBox */}
                {isDialogue(currentPhrase) && (
                    <div className="flex shrink-0 justify-between gap-4 px-6 pt-4 pb-0 h-[140px] items-end">
                        <div className="flex gap-2 items-end">
                            {(currentPhrase.portraits?.left ?? (currentPhrase.speakerId ? [currentPhrase.speakerId] : [])).slice(0, 2).map((npcId) => {
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

                {/* VNTextBox: dialogue or choices */}
                <div className="shrink-0 px-6 pb-6">
                    {isDialogue(currentPhrase) ? (
                        <VNTextBox
                            title={getNpc(currentPhrase.speakerId)?.name ?? 'Unknown'}
                            titleColor={getNpc(currentPhrase.speakerId)?.color ?? '#ffffff'}
                        >
                            <>
                                <p className="mb-6">{currentPhrase.text}</p>
                                <button
                                    type="button"
                                    onClick={advancePhrase}
                                    className="px-6 py-2 bg-primary text-white font-semibold rounded-lg hover:opacity-90"
                                >
                                    Next
                                </button>
                            </>
                        </VNTextBox>
                    ) : (
                        <VNTextBox>
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
                        </VNTextBox>
                    )}
                </div>
            </div>
        </div>
    );
}
