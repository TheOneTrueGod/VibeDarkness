/**
 * Post-mission story phase - visual novel segment after victory.
 * Each player advances at their own pace. Choice results are sent to the server.
 * When the player completes (makes their choice), onComplete is called with rewards.
 */
import React, { useState, useCallback, useEffect } from 'react';
import type { PlayerState } from '../../../../types';
import { LobbyClient } from '../../../../LobbyClient';
import { MessageType } from '../../../../MessageTypes';
import { getNpc } from '../../constants/npcs';
import type {
    PostMissionStoryDef,
    DialoguePhrase,
    ChoicePhrase,
    PostMissionPhrase,
    StoryChoiceActionGrantResources,
} from '../../storylines/storyTypes';
import { getItemDef } from '../../character_defs/items';
import { SPECTATOR_ID } from '../../state';
import ResourcePill, { campaignResourceGains } from '../../../../components/ResourcePill';
import VNTextBox from '../components/VNTextBox';
import CharacterPortrait from '../components/CharacterPortrait';
import StoryTextEffect from '../components/StoryTextEffect';

function isDialogue(phrase: PostMissionPhrase | undefined): phrase is DialoguePhrase {
    return !!phrase && phrase.type === 'dialogue';
}

function isChoice(phrase: PostMissionPhrase | undefined): phrase is ChoicePhrase {
    return phrase?.type === 'choice';
}

function isGrantResources(action: { type: string } | undefined): action is StoryChoiceActionGrantResources {
    return !!action && action.type === 'grant_resources';
}

export interface MissionRewards {
    resourceDelta?: Partial<Record<'food' | 'metal' | 'crystals', number>>;
    itemFromFirstChoice?: string;
}

interface PostMissionStoryPhaseProps {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    missionId: string;
    players: Record<string, PlayerState>;
    /** Character selections; spectators do not get rewards. */
    characterSelections?: Record<string, string>;
    postMissionStory: PostMissionStoryDef;
    /** Current equipment per player (from server); used to show item from first choice. */
    playerEquipmentByPlayer?: Record<string, string[]>;
    onComplete: (rewards: MissionRewards) => void;
}

export default function PostMissionStoryPhase({
    lobbyClient,
    lobbyId,
    gameId,
    playerId,
    missionId,
    players,
    characterSelections = {},
    postMissionStory,
    playerEquipmentByPlayer = {},
    onComplete,
}: PostMissionStoryPhaseProps) {
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [backgroundImage, setBackgroundImage] = useState<string | undefined>();
    const [bgOpacity, setBgOpacity] = useState(1);

    const phrases: PostMissionPhrase[] = postMissionStory.phrases;
    const currentPhrase = phrases[phraseIndex];
    const isEnd = phraseIndex >= phrases.length;
    const amSpectator = (characterSelections[playerId] ?? '') === SPECTATOR_ID;

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

            const action = option?.action;
            const resourceDelta =
                isGrantResources(action) && action
                    ? {
                          ...(action.food != null && { food: action.food }),
                          ...(action.metal != null && { metal: action.metal }),
                          ...(action.crystals != null && { crystals: action.crystals }),
                      }
                    : undefined;

            const itemFromFirstChoice =
                action?.type === 'equip_item' && action.itemId ? action.itemId : undefined;

            onComplete({
                resourceDelta: resourceDelta ?? undefined,
                itemFromFirstChoice,
            });
        },
        [lobbyClient, lobbyId, playerId, playerEquipmentByPlayer, onComplete]
    );

    if (isEnd) {
        return null;
    }

    if (!currentPhrase) {
        return null;
    }

    const showBackground = isDialogue(currentPhrase) && currentPhrase.backgroundImage;
    const isTitleEffect = isDialogue(currentPhrase) && currentPhrase.textEffect === 'title_bounce';

    return (
        <div className="w-full h-full flex flex-col overflow-hidden bg-black relative">
            {backgroundImage && showBackground && (
                <div
                    className="absolute inset-0 bg-cover bg-center transition-opacity duration-500 z-0"
                    style={{ backgroundImage: `url(${backgroundImage})`, opacity: bgOpacity }}
                />
            )}
            <div className="relative z-10 flex-1 flex flex-col min-h-0 justify-end items-center">
                <div className="w-full max-w-[1200px] flex flex-col flex-1 min-h-0 justify-end mx-auto px-6">
                    {isDialogue(currentPhrase) && (
                        <div className="flex shrink-0 justify-between gap-4 pt-4 pb-0 h-[140px] items-end">
                            <div className="flex gap-2 items-end">
                                {(currentPhrase.portraits?.left ??
                                    (currentPhrase.speakerId ? [currentPhrase.speakerId] : []))
                                    .slice(0, 2)
                                    .map((npcId) => {
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

                    <div className="shrink-0 pb-6 flex flex-col gap-4">
                        {isDialogue(currentPhrase) ? (
                            <VNTextBox
                                title={getNpc(currentPhrase.speakerId)?.name ?? 'Narrator'}
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
                            amSpectator ? (
                                <div className="shrink-0 pb-6">
                                    <p className="text-muted mb-4">Spectators do not receive rewards.</p>
                                    <button
                                        type="button"
                                        onClick={() => onComplete({})}
                                        className="px-6 py-2 bg-primary text-white font-semibold rounded-lg hover:opacity-90"
                                    >
                                        Next
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="border-2 border-border-custom rounded-lg bg-surface-light shadow-lg overflow-hidden p-6">
                                        <div className="space-y-3">
                                            {currentPhrase.options.map((opt) => (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    onClick={() =>
                                                        handleChoice(currentPhrase.choiceId, opt.id, opt)
                                                    }
                                                    className="block w-full text-left px-6 py-4 rounded-lg border-2 border-border-custom bg-surface hover:border-primary hover:bg-surface-light/80 transition-colors text-lg text-white flex flex-col gap-2"
                                                >
                                                    <span>{opt.label}</span>
                                                    {isGrantResources(opt.action) && (
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {campaignResourceGains({
                                                                food: opt.action.food,
                                                                metal: opt.action.metal,
                                                                crystals: opt.action.crystals,
                                                            }).map(({ resource, count }) => (
                                                                <ResourcePill
                                                                    key={`${opt.id}-${resource}`}
                                                                    resource={resource}
                                                                    count={count}
                                                                />
                                                            ))}
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="min-h-[16rem]" aria-hidden />
                                </>
                            )
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
