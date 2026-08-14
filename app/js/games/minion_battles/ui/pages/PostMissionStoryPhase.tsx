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
import type {
    PostMissionStoryDef,
    DialoguePhrase,
    ChoicePhrase,
    GrantResearchAutoPhrase,
    PortraitSide,
    PostMissionPhrase,
    StoryChoiceAction,
    StoryChoiceActionGrantResearchConditional,
    StoryChoiceActionGrantResearchToPlayer,
} from '../../storylines/storyTypes';
import { MISSION_MAP } from '../../storylines';
import { resolveResearchRewardSlots } from '../../storylines/researchRewardSlots';
import { getItemDef } from '../../character_defs/items';
import { SPECTATOR_ID, isControlEnemy } from '../../state';
import { getResearchNode } from '../../../../researchTrees/list';
import type { ResearchNodeDef } from '../../../../researchTrees/types';
import PreMissionStoryLayout from './preMissionStory/PreMissionStoryLayout';
import PostMissionChoicePanel from './preMissionStory/PostMissionChoicePanel';
import { STORY_CHOICE_BOTTOM_ROW_CLASS } from './preMissionStory/storyChoiceGrid';
import StorySegmentSpeakerPortrait from '../components/battleUiSlots/StorySegmentSpeakerPortrait';
import RowSlotDialogue from '../components/battleUiSlots/RowSlotDialogue';
import ColumnSlotPlayerStatuses from '../../../../components/battleUILayout/ColumnSlotPlayerStatuses';
import {
    addResourceDelta,
    allEligiblePlayersHaveChoice,
    choiceOptionsHaveAlsoGrantToOthers,
    eligibleStoryRewardPlayerIds,
    sumAlsoGrantToOthersFromParty,
} from '../../storylines/partyStoryGrants';

function isDialogue(phrase: PostMissionPhrase | undefined): phrase is DialoguePhrase {
    return !!phrase && phrase.type === 'dialogue';
}

function isChoice(phrase: PostMissionPhrase | undefined): phrase is ChoicePhrase {
    return phrase?.type === 'choice';
}

function isGrantResearchAuto(phrase: PostMissionPhrase | undefined): phrase is GrantResearchAutoPhrase {
    return phrase?.type === 'grant_research_auto';
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
    /** Per-player research node ids by tree (lobby game state); used when a mission computes post-mission research options. */
    playerResearchTreesByPlayer?: Record<string, Record<string, string[]>>;
    /** playerId → choiceId → optionId (lobby game state); used for alsoGrantToOthers stacking. */
    playerStoryChoices?: Record<string, Record<string, string>>;
    onComplete: (rewards: MissionRewards) => void;
    /** Header slot content, forwarded from GameScreen via Game.tsx. */
    headerSlot?: React.ReactNode;
    /** Right column slot content (chat), forwarded from GameScreen via Game.tsx. */
    chatSlot?: React.ReactNode;
    /** Loading/resync overlay, forwarded from GameScreen via Game.tsx. */
    centerOverlay?: React.ReactNode;
}

export default function PostMissionStoryPhase({
    api,
    playerId,
    missionId,
    players,
    characterSelections = {},
    postMissionStory,
    playerEquipmentByPlayer = {},
    playerResearchTreesByPlayer = {},
    playerStoryChoices = {},
    onComplete,
    headerSlot,
    chatSlot,
    centerOverlay,
}: PostMissionStoryPhaseProps) {
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [backgroundImage, setBackgroundImage] = useState<string | undefined>();
    const [bgOpacity, setBgOpacity] = useState(1);
    /** After a reward choice, hide the VN UI so the victory modal does not sit over changing/disabled options. */
    const [phantomPostChoiceStep, setPhantomPostChoiceStep] = useState(false);
    /** Waiting for party choices when alsoGrantToOthers is in play. */
    const [waitingForPartyChoiceId, setWaitingForPartyChoiceId] = useState<string | null>(null);
    const hasCompletedRef = useRef(false);
    const pendingPartyChoiceOptionsRef = useRef<ChoicePhrase['options'] | null>(null);
    /** When post-mission story has multiple choice phrases, collect grants before final `onComplete`. */
    const accumulatedResearchIdsRef = useRef<string[]>([]);
    const accumulatedResearchEntriesRef = useRef<MissionResearchRewardEntry[]>([]);
    const firstEquipItemRef = useRef<string | undefined>(undefined);
    const accumulatedResourceDeltaRef = useRef<Partial<Record<'food' | 'metal' | 'crystals', number>>>({});

    useEffect(() => {
        accumulatedResearchIdsRef.current = [];
        accumulatedResearchEntriesRef.current = [];
        firstEquipItemRef.current = undefined;
        accumulatedResourceDeltaRef.current = {};
        setPhraseIndex(0);
        setPhantomPostChoiceStep(false);
        hasCompletedRef.current = false;
    }, [missionId]);

    const phrases: PostMissionPhrase[] = postMissionStory.phrases;
    const currentPhrase = phrases[phraseIndex];
    const isEnd = phraseIndex >= phrases.length;
    const amSpectator = (characterSelections[playerId] ?? '') === SPECTATOR_ID;
    const amNpcController = isControlEnemy(characterSelections[playerId]);

    const myEquipment = playerEquipmentByPlayer[playerId] ?? [];
    const myResearchTrees = playerResearchTreesByPlayer[playerId];
    // Content fingerprints — lobby polls often replace equal equipment/research with new object refs.
    const equipmentKey = myEquipment.join('\0');
    const researchKey = JSON.stringify(myResearchTrees ?? {});

    const postMissionChoiceOptions = useMemo((): ChoicePhrase['options'] => {
        if (!currentPhrase || currentPhrase.type !== 'choice') return [];

        if (currentPhrase.researchRewardSlots) {
            return resolveResearchRewardSlots(
                currentPhrase.researchRewardSlots,
                myResearchTrees,
                myEquipment,
            );
        }

        const missionDef = MISSION_MAP[missionId];
        const computed = missionDef?.getPostMissionChoiceOptions?.({
            choiceId: currentPhrase.choiceId,
            equippedItemIds: myEquipment,
            playerResearchTrees: myResearchTrees,
            playerId,
        });
        return computed ?? currentPhrase.options;
        // equipmentKey / researchKey fingerprint content; omit object refs that churn every poll.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- myEquipment/myResearchTrees via keys
    }, [currentPhrase, missionId, playerId, equipmentKey, researchKey]);

    useEffect(() => {
        if (currentPhrase && isDialogue(currentPhrase) && currentPhrase.backgroundImage) {
            setBackgroundImage(currentPhrase.backgroundImage);
            setBgOpacity(0);
            requestAnimationFrame(() => setBgOpacity(1));
        }
    }, [phraseIndex, currentPhrase]);

    useEffect(() => {
        if (!currentPhrase || !isGrantResearchAuto(currentPhrase) || amSpectator || amNpcController) {
            if (currentPhrase && isGrantResearchAuto(currentPhrase) && (amSpectator || amNpcController)) {
                advancePhrase();
            }
            return;
        }
        const phrase = currentPhrase;
        const myResearch = playerResearchTreesByPlayer[playerId] ?? {};
        const shouldSkip = (phrase.skipIfResearched ?? []).some(({ treeId, nodeIds }) =>
            (myResearch[treeId] ?? []).some((id) => nodeIds.includes(id))
        );
        if (shouldSkip) {
            advancePhrase();
            return;
        }
        const rewardId = `${phrase.treeId}+${phrase.nodeId}`;
        void api.sendMessage(MessageType.STORY_CHOICE, {
            choiceId: 'auto_grant_research',
            optionId: 'auto',
            actionType: 'grant_research_to_player' as const,
            treeId: phrase.treeId,
            nodeId: phrase.nodeId,
            researchRewardId: rewardId,
        }).catch((err) => console.error('Failed to auto-grant research:', err));
        const node = getResearchNode(phrase.treeId, phrase.nodeId);
        if (node) {
            accumulatedResearchIdsRef.current.push(rewardId);
            accumulatedResearchEntriesRef.current.push({ treeId: phrase.treeId, nodeId: phrase.nodeId });
        }
        advancePhrase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [phraseIndex]);

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
                disabled: !!option.disabledLabel,
            };
        },
        [playerEquipmentByPlayer, playerId]
    );

    const finishAfterChoice = useCallback(
        (choiceId: string, optionsForParty: ChoicePhrase['options']) => {
            if (hasCompletedRef.current) return;

            const eligible = eligibleStoryRewardPlayerIds(characterSelections);
            if (!amSpectator && !amNpcController && choiceOptionsHaveAlsoGrantToOthers(optionsForParty)) {
                addResourceDelta(
                    accumulatedResourceDeltaRef.current,
                    sumAlsoGrantToOthersFromParty(
                        playerId,
                        choiceId,
                        optionsForParty,
                        eligible,
                        playerStoryChoices,
                    ),
                );
            }

            const morePhrasesRemain = phraseIndex < phrases.length - 1;
            if (morePhrasesRemain) {
                setWaitingForPartyChoiceId(null);
                pendingPartyChoiceOptionsRef.current = null;
                setPhraseIndex((i) => i + 1);
                return;
            }

            flushSync(() => {
                setPhantomPostChoiceStep(true);
            });

            const resourceDeltaFlat = accumulatedResourceDeltaRef.current;
            const resourceDelta =
                Object.keys(resourceDeltaFlat).length > 0
                    ? {
                          ...(resourceDeltaFlat.food != null && { food: resourceDeltaFlat.food }),
                          ...(resourceDeltaFlat.metal != null && { metal: resourceDeltaFlat.metal }),
                          ...(resourceDeltaFlat.crystals != null && {
                              crystals: resourceDeltaFlat.crystals,
                          }),
                      }
                    : undefined;

            if (hasCompletedRef.current) return;
            hasCompletedRef.current = true;
            setWaitingForPartyChoiceId(null);
            pendingPartyChoiceOptionsRef.current = null;
            onComplete({
                resourceDelta,
                itemFromFirstChoice: firstEquipItemRef.current,
                researchRewardIds:
                    accumulatedResearchIdsRef.current.length > 0
                        ? accumulatedResearchIdsRef.current
                        : undefined,
                researchRewards:
                    accumulatedResearchEntriesRef.current.length > 0
                        ? accumulatedResearchEntriesRef.current
                        : undefined,
            });
        },
        [
            amSpectator,
            amNpcController,
            characterSelections,
            onComplete,
            phraseIndex,
            phrases.length,
            playerId,
            playerStoryChoices,
        ],
    );

    const handleChoice = useCallback(
        async (
            choiceId: string,
            optionId: string,
            option?: { action?: StoryChoiceAction; itemId?: string },
            resolvedOption?: ResolvedChoiceOption,
        ) => {
            if (resolvedOption?.disabled) return;
            if (waitingForPartyChoiceId) return;
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
                    ...(!amNpcController && itemId !== undefined && { itemId, replaceItemIds }),
                    ...(!amNpcController && resolvedOption?.researchReward && {
                        actionType: 'grant_research_to_player' as const,
                        treeId: resolvedOption.researchReward.treeId,
                        nodeId: resolvedOption.researchReward.nodeId,
                        researchRewardId: resolvedOption.researchReward.rewardId,
                    }),
                });
            } catch (error) {
                console.error('Failed to send story choice:', error);
            }

            const action = option?.action;

            if (!amNpcController && resolvedOption?.researchReward) {
                accumulatedResearchIdsRef.current.push(resolvedOption.researchReward.rewardId);
                accumulatedResearchEntriesRef.current.push({
                    treeId: resolvedOption.researchReward.treeId,
                    nodeId: resolvedOption.researchReward.nodeId,
                });
            }

            if (
                !amNpcController
                && action?.type === 'equip_item'
                && action.itemId
                && firstEquipItemRef.current === undefined
            ) {
                firstEquipItemRef.current = action.itemId;
            }

            if (!amNpcController && isGrantResources(action) && action) {
                addResourceDelta(accumulatedResourceDeltaRef.current, {
                    food: action.food,
                    metal: action.metal,
                    crystals: action.crystals,
                });
            }

            const optionsForParty = postMissionChoiceOptions;
            const needsPartyWait =
                !amSpectator
                && !amNpcController
                && choiceOptionsHaveAlsoGrantToOthers(optionsForParty);

            if (needsPartyWait) {
                pendingPartyChoiceOptionsRef.current = optionsForParty;
                setWaitingForPartyChoiceId(choiceId);
                const eligible = eligibleStoryRewardPlayerIds(characterSelections);
                // Include our just-sent choice locally for the wait check.
                const mergedChoices: Record<string, Record<string, string>> = {
                    ...playerStoryChoices,
                    [playerId]: {
                        ...(playerStoryChoices[playerId] ?? {}),
                        [choiceId]: optionId,
                    },
                };
                if (allEligiblePlayersHaveChoice(choiceId, eligible, mergedChoices)) {
                    finishAfterChoice(choiceId, optionsForParty);
                }
                return;
            }

            finishAfterChoice(choiceId, optionsForParty);
        },
        [
            amNpcController,
            amSpectator,
            api,
            characterSelections,
            finishAfterChoice,
            playerEquipmentByPlayer,
            playerId,
            playerStoryChoices,
            postMissionChoiceOptions,
            waitingForPartyChoiceId,
        ],
    );

    useEffect(() => {
        if (!waitingForPartyChoiceId) return;
        const eligible = eligibleStoryRewardPlayerIds(characterSelections);
        if (!allEligiblePlayersHaveChoice(waitingForPartyChoiceId, eligible, playerStoryChoices)) {
            return;
        }
        const options = pendingPartyChoiceOptionsRef.current ?? [];
        finishAfterChoice(waitingForPartyChoiceId, options);
    }, [
        waitingForPartyChoiceId,
        playerStoryChoices,
        characterSelections,
        finishAfterChoice,
    ]);

    if (phantomPostChoiceStep) {
        return <div className="w-full h-full min-h-full bg-black" aria-hidden />;
    }

    if (isEnd) {
        return null;
    }

    if (!currentPhrase) {
        return null;
    }

    if (isGrantResearchAuto(currentPhrase)) {
        return null;
    }

    const dialoguePhrase: DialoguePhrase | null = isDialogue(currentPhrase) ? currentPhrase : null;
    const choicePhrase: ChoicePhrase | null = isChoice(currentPhrase) ? currentPhrase : null;
    const showingDialogue = dialoguePhrase != null;
    const showingChoiceInBottomRow = choicePhrase != null;
    const portraitSide: PortraitSide = dialoguePhrase?.portraitSide ?? 'left';
    const speakerPortrait = dialoguePhrase ? (
        <StorySegmentSpeakerPortrait speakerId={dialoguePhrase.speakerId} />
    ) : null;
    const layerBackground =
        dialoguePhrase?.backgroundImage != null ? backgroundImage : undefined;

    const choicePanel = choicePhrase ? (
        <PostMissionChoicePanel
            phrase={choicePhrase}
            options={postMissionChoiceOptions}
            amSpectator={amSpectator}
            waitingForPartyChoiceId={waitingForPartyChoiceId}
            resolveChoiceOption={resolveChoiceOption}
            onChoose={handleChoice}
            onSpectatorComplete={() => onComplete({})}
        />
    ) : null;

    return (
        <PreMissionStoryLayout
            backgroundImage={layerBackground}
            bgOpacity={bgOpacity}
            headerSlot={headerSlot}
            chatSlot={chatSlot}
            centerOverlay={centerOverlay}
            leftColumn={
                <ColumnSlotPlayerStatuses
                    players={players}
                    currentPlayerId={playerId}
                    characterSelections={characterSelections}
                />
            }
            bottomLeftCorner={portraitSide === 'left' ? speakerPortrait : undefined}
            bottomLeftCornerPadded={portraitSide === 'left' ? false : undefined}
            bottomRightCorner={portraitSide === 'right' ? speakerPortrait : undefined}
            bottomRightCornerPadded={portraitSide === 'right' ? false : undefined}
            bottomRow={
                dialoguePhrase ? (
                    <RowSlotDialogue phrase={dialoguePhrase} onAdvance={advancePhrase} speakerNameFallback="Narrator" />
                ) : showingChoiceInBottomRow ? (
                    choicePanel
                ) : undefined
            }
            bottomRowClassName={showingChoiceInBottomRow ? STORY_CHOICE_BOTTOM_ROW_CLASS : undefined}
            centerFloatingNext={
                dialoguePhrase ? (
                    <button
                        type="button"
                        onClick={advancePhrase}
                        className="px-6 py-2 bg-primary text-white font-semibold rounded-lg shadow-lg hover:opacity-90"
                    >
                        Next
                    </button>
                ) : undefined
            }
        >
            {showingDialogue || showingChoiceInBottomRow ? null : undefined}
        </PreMissionStoryLayout>
    );
}
