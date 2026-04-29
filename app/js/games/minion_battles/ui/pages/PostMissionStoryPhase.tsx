/**
 * Post-mission story phase - visual novel segment after victory.
 * Each player advances at their own pace. Choice results are sent to the server.
 * When the player completes (makes their choice), onComplete is called with rewards.
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { flushSync } from 'react-dom';
import type { MissionResearchRewardEntry, PlayerState } from '../../../../types';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import { MessageType } from '../../../../MessageTypes';
import { getNpc } from '../../constants/npcs';
import type {
    PostMissionStoryDef,
    DialoguePhrase,
    ChoicePhrase,
    PostMissionPhrase,
    StoryChoiceAction,
    StoryChoiceActionGrantResearchConditional,
    StoryChoiceActionGrantResearchToPlayer,
    StoryChoiceActionGrantResources,
} from '../../storylines/storyTypes';
import { getComputedPostMissionChoiceOptions } from '../../storylines/customPostMissionChoices';
import { getItemDef } from '../../character_defs/items';
import { SPECTATOR_ID } from '../../state';
import ResourcePill, { campaignResourceGains } from '../../../../components/ResourcePill';
import ResearchNodeCard from '../components/ResearchNodeCard';
import { getResearchNode } from '../../../../researchTrees/list';
import type { ResearchNodeDef } from '../../../../researchTrees/types';
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

function isGrantResearchToPlayer(
    action: StoryChoiceAction | undefined
): action is StoryChoiceActionGrantResearchToPlayer {
    return !!action && action.type === 'grant_research_to_player';
}

function isGrantResearchConditional(
    action: StoryChoiceAction | undefined
): action is StoryChoiceActionGrantResearchConditional {
    return !!action && action.type === 'grant_research_conditional';
}

export interface MissionRewards {
    resourceDelta?: Partial<Record<'food' | 'metal' | 'crystals', number>>;
    itemFromFirstChoice?: string;
    researchRewardIds?: string[];
    researchRewards?: MissionResearchRewardEntry[];
}

interface ResolvedChoiceResearchReward {
    treeId: string;
    nodeId: string;
    rewardId: string;
    node: ResearchNodeDef;
}

interface ResolvedChoiceOption {
    action?: StoryChoiceAction;
    disabledLabel?: string;
    researchReward?: ResolvedChoiceResearchReward;
    disabled: boolean;
}

function resolveResearchReward(treeId: string, nodeId: string): ResolvedChoiceResearchReward | null {
    const node = getResearchNode(treeId, nodeId);
    if (!node) return null;
    return {
        treeId,
        nodeId,
        rewardId: `${treeId}+${nodeId}`,
        node,
    };
}

interface PostMissionStoryPhaseProps {
    api: MinionBattlesApi;
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
    api,
    playerId,
    missionId,
    players: _players,
    characterSelections = {},
    postMissionStory,
    playerEquipmentByPlayer = {},
    onComplete,
}: PostMissionStoryPhaseProps) {
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [backgroundImage, setBackgroundImage] = useState<string | undefined>();
    const [bgOpacity, setBgOpacity] = useState(1);
    /** After a reward choice, hide the VN UI so the victory modal does not sit over changing/disabled options. */
    const [phantomPostChoiceStep, setPhantomPostChoiceStep] = useState(false);
    const hasCompletedRef = useRef(false);

    const phrases: PostMissionPhrase[] = postMissionStory.phrases;
    const currentPhrase = phrases[phraseIndex];
    const isEnd = phraseIndex >= phrases.length;
    const amSpectator = (characterSelections[playerId] ?? '') === SPECTATOR_ID;

    const postMissionChoiceOptions = useMemo((): ChoicePhrase['options'] => {
        if (!currentPhrase || currentPhrase.type !== 'choice') return [];
        const computed = getComputedPostMissionChoiceOptions({
            missionId,
            choiceId: currentPhrase.choiceId,
            resolverId: currentPhrase.resolverId,
            equippedItemIds: playerEquipmentByPlayer[playerId] ?? [],
        });
        return computed ?? currentPhrase.options;
    }, [currentPhrase, missionId, playerId, playerEquipmentByPlayer]);

    useEffect(() => {
        if (currentPhrase && isDialogue(currentPhrase) && currentPhrase.backgroundImage) {
            setBackgroundImage(currentPhrase.backgroundImage);
            setBgOpacity(0);
            requestAnimationFrame(() => setBgOpacity(1));
        }
    }, [phraseIndex, currentPhrase]);

    const completeIfNeeded = useCallback(() => {
        if (hasCompletedRef.current) return;
        hasCompletedRef.current = true;
        onComplete({});
    }, [onComplete]);

    const advancePhrase = useCallback(() => {
        setPhraseIndex((i) => {
            const next = Math.min(i + 1, phrases.length);
            if (next >= phrases.length) {
                completeIfNeeded();
            }
            return next;
        });
    }, [phrases.length, completeIfNeeded]);

    const resolveChoiceOption = useCallback(
        (option: ChoicePhrase['options'][number]): ResolvedChoiceOption => {
            const action = option.action;
            if (isGrantResearchToPlayer(action)) {
                const researchReward = resolveResearchReward(action.treeId, action.nodeId);
                return {
                    action,
                    disabledLabel: option.disabledLabel,
                    researchReward: researchReward ?? undefined,
                    disabled: !researchReward,
                };
            }

            if (isGrantResearchConditional(action)) {
                const equippedIds = playerEquipmentByPlayer?.[playerId] ?? [];
                const candidate = action.candidates.find((c) => equippedIds.includes(c.equippedItemId));
                if (!candidate) {
                    return {
                        action,
                        disabledLabel: option.disabledLabel,
                        disabled: true,
                    };
                }
                const researchReward = resolveResearchReward(candidate.treeId, candidate.nodeId);
                return {
                    action,
                    disabledLabel: option.disabledLabel,
                    researchReward: researchReward ?? undefined,
                    disabled: !researchReward,
                };
            }

            return {
                action,
                disabledLabel: option.disabledLabel,
                disabled: false,
            };
        },
        [playerEquipmentByPlayer, playerId]
    );

    const handleChoice = useCallback(
        async (
            choiceId: string,
            optionId: string,
            option?: { action?: { type: string; itemId?: string } },
            resolvedOption?: ResolvedChoiceOption
        ) => {
            if (resolvedOption?.disabled) return;
            try {
                const currentEquipment = playerEquipmentByPlayer?.[playerId] ?? [];
                let itemId: string | undefined;
                const replaceItemIds: string[] = [];
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
                await api.sendMessage(MessageType.STORY_CHOICE, {
                    choiceId,
                    optionId,
                    ...(itemId !== undefined && { itemId, replaceItemIds }),
                    ...(resolvedOption?.researchReward && {
                        actionType: 'grant_research_to_player' as const,
                        treeId: resolvedOption.researchReward.treeId,
                        nodeId: resolvedOption.researchReward.nodeId,
                        researchRewardId: resolvedOption.researchReward.rewardId,
                    }),
                });
            } catch (error) {
                console.error('Failed to send story choice:', error);
            }

            // Phantom “last step”: paint an empty frame before completing so nothing remains behind the victory modal.
            flushSync(() => {
                setPhantomPostChoiceStep(true);
            });

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

            if (hasCompletedRef.current) return;
            hasCompletedRef.current = true;
            onComplete({
                resourceDelta: resourceDelta ?? undefined,
                itemFromFirstChoice,
                researchRewardIds: resolvedOption?.researchReward
                    ? [resolvedOption.researchReward.rewardId]
                    : undefined,
                researchRewards: resolvedOption?.researchReward
                    ? [{ treeId: resolvedOption.researchReward.treeId, nodeId: resolvedOption.researchReward.nodeId }]
                    : undefined,
            });
        },
        [api, playerId, playerEquipmentByPlayer, onComplete]
    );

    if (phantomPostChoiceStep) {
        return <div className="w-full h-full min-h-full bg-black" aria-hidden />;
    }

    if (isEnd) {
        return null;
    }

    if (!currentPhrase) {
        return null;
    }

    const showBackground = isDialogue(currentPhrase) && currentPhrase.backgroundImage;
    const isTitleEffect = isDialogue(currentPhrase) && currentPhrase.textEffect === 'title_bounce';
    /** Choice phases use vertical centering + scroll; dialogue stays bottom-aligned (VN layout). */
    const centerChoiceInViewport = isChoice(currentPhrase);

    return (
        <div className="w-full h-full flex flex-col overflow-hidden bg-black relative">
            {backgroundImage && showBackground && (
                <div
                    className="absolute inset-0 bg-cover bg-center transition-opacity duration-500 z-0"
                    style={{ backgroundImage: `url(${backgroundImage})`, opacity: bgOpacity }}
                />
            )}
            <div
                className={`relative z-10 flex min-h-0 flex-1 flex-col items-center ${
                    centerChoiceInViewport ? 'justify-center' : 'justify-end'
                }`}
            >
                <div
                    className={`mx-auto flex w-full max-w-[1200px] flex-col px-6 min-h-0 ${
                        centerChoiceInViewport
                            ? 'flex-1 overflow-y-auto overflow-x-hidden py-6'
                            : 'flex-1 justify-end'
                    }`}
                >
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

                    <div
                        className={`flex flex-col gap-4 pb-6 ${
                            centerChoiceInViewport ? 'my-auto min-h-0 w-full' : 'shrink-0'
                        }`}
                    >
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
                                    <div className="border-2 border-border-custom rounded-lg bg-surface-light shadow-lg overflow-visible p-6">
                                        <div className="space-y-3">
                                            {postMissionChoiceOptions.map((opt) => {
                                                const resolvedOption = resolveChoiceOption(opt);
                                                const showPlaceholderText =
                                                    resolvedOption.disabled &&
                                                    (resolvedOption.disabledLabel ?? '<Not Implemented>');
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        disabled={resolvedOption.disabled}
                                                        onClick={() =>
                                                            handleChoice(
                                                                currentPhrase.choiceId,
                                                                opt.id,
                                                                opt,
                                                                resolvedOption
                                                            )
                                                        }
                                                        className={`block w-full text-left px-6 py-4 rounded-lg border-2 transition-colors text-lg flex flex-col gap-2 ${
                                                            resolvedOption.disabled
                                                                ? 'border-border-custom bg-surface/50 text-gray-400 cursor-not-allowed'
                                                                : 'border-border-custom bg-surface hover:border-primary hover:bg-surface-light/80 text-white'
                                                        }`}
                                                    >
                                                        <span className="text-lg font-medium text-white">
                                                            {opt.loreTitle ?? opt.label}
                                                        </span>
                                                        {showPlaceholderText ? (
                                                            <span className="text-sm text-zinc-500 leading-snug">
                                                                {showPlaceholderText}
                                                            </span>
                                                        ) : (
                                                            opt.loreDescription && (
                                                                <span className="text-sm text-zinc-400 leading-snug">
                                                                    {opt.loreDescription}
                                                                </span>
                                                            )
                                                        )}
                                                        {resolvedOption.researchReward && (
                                                            <div className="pt-1 flex justify-start">
                                                                <ResearchNodeCard
                                                                    node={resolvedOption.researchReward.node}
                                                                    variant="display"
                                                                    tone="muted"
                                                                    layout="comfortable"
                                                                    showCost={false}
                                                                    showRequirements={false}
                                                                    state="researched"
                                                                />
                                                            </div>
                                                        )}
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
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
