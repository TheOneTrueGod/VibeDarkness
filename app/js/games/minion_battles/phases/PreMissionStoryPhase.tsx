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
import VNTextBox from '../components/VNTextBox';

interface PreMissionStoryPhaseProps {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    preMissionStory: PreMissionStoryDef;
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
    preMissionStory,
    onPhaseChange,
}: PreMissionStoryPhaseProps) {
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [backgroundImage, setBackgroundImage] = useState<string | undefined>();
    const [bgOpacity, setBgOpacity] = useState(1);

    const phrases = preMissionStory.phrases;
    const currentPhrase = phrases[phraseIndex];
    const isEnd = phraseIndex >= phrases.length;

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
        async (choiceId: string, optionId: string) => {
            try {
                await lobbyClient.sendMessage(lobbyId, playerId, MessageType.STORY_CHOICE, {
                    choiceId,
                    optionId,
                });
            } catch (error) {
                console.error('Failed to send story choice:', error);
            }
            advancePhrase();
        },
        [lobbyClient, lobbyId, playerId, advancePhrase]
    );

    if (isEnd) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-surface">
                {isHost ? (
                    <button
                        type="button"
                        onClick={handleStartGame}
                        className="px-8 py-3 text-white text-lg font-bold rounded-lg bg-green-600 hover:bg-green-700 shadow-lg cursor-pointer"
                    >
                        Start Game
                    </button>
                ) : (
                    <p className="text-muted text-lg">Waiting for host to start the game...</p>
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
                                return (
                                    <div
                                        key={npcId}
                                        className={`w-24 h-24 rounded-lg overflow-hidden border-2 flex-shrink-0 ${
                                            isActive ? 'border-primary shadow-lg' : 'border-border-custom opacity-70'
                                        }`}
                                    >
                                        {npc?.portrait ? (
                                            <div
                                                className="w-full h-full bg-background"
                                                dangerouslySetInnerHTML={{ __html: npc.portrait }}
                                            />
                                        ) : (
                                            <div
                                                className="w-full h-full"
                                                style={{ backgroundColor: npc?.color ?? '#333' }}
                                            />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="flex gap-2 items-end">
                            {(currentPhrase.portraits?.right ?? []).slice(0, 2).map((npcId) => {
                                const npc = getNpc(npcId);
                                const isActive = currentPhrase.speakerId === npcId;
                                return (
                                    <div
                                        key={npcId}
                                        className={`w-24 h-24 rounded-lg overflow-hidden border-2 flex-shrink-0 ${
                                            isActive ? 'border-primary shadow-lg' : 'border-border-custom opacity-70'
                                        }`}
                                    >
                                        {npc?.portrait ? (
                                            <div
                                                className="w-full h-full bg-background"
                                                dangerouslySetInnerHTML={{ __html: npc.portrait }}
                                            />
                                        ) : (
                                            <div
                                                className="w-full h-full"
                                                style={{ backgroundColor: npc?.color ?? '#333' }}
                                            />
                                        )}
                                    </div>
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
                                        onClick={() => handleChoice(currentPhrase.choiceId, opt.id)}
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
