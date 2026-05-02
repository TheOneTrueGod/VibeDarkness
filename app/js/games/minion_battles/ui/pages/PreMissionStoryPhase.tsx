/**
 * Pre-mission story phase - visual novel style segment.
 * Each player advances at their own pace (local phrase index). Only choice results are sent to the server.
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { PlayerState } from '../../../../types';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import { MessageType } from '../../../../MessageTypes';
import type { PreMissionStoryDef } from '../../storylines/storyTypes';
import { SPECTATOR_ID } from '../../state';
import { getItemDef } from '../../character_defs/items';
import PreMissionStoryEndScreen from './preMissionStory/PreMissionStoryEndScreen';
import PreMissionStoryLayout, { type StoryViewportLayoutMode } from './preMissionStory/PreMissionStoryLayout';
import DialoguePortraitRow from './preMissionStory/DialoguePortraitRow';
import DialoguePortraitSidebar from './preMissionStory/DialoguePortraitSidebar';
import { STORY_VIEWPORT_WINDOW_LAPTOP_MAX_PX } from './preMissionStory/storyViewportConstants';
import StoryPhraseBottomPanel from './preMissionStory/StoryPhraseBottomPanel';
import { isDialogue, isGrantEquipmentRandom, isGroupVote } from './preMissionStory/preMissionStoryTypeGuards';

interface PreMissionStoryPhaseProps {
    api: MinionBattlesApi;
    playerId: string;
    isHost: boolean;
    /** Mission ID for this story; used for deterministic equipment grants. */
    missionId: string;
    players: Record<string, PlayerState>;
    /** Character selections; spectators (SPECTATOR_ID) don't vote or get choices. */
    characterSelections?: Record<string, string>;
    preMissionStory: PreMissionStoryDef;
    /** Player IDs that have reached the final "start game" card (synced from server). */
    storyReadyPlayerIds: string[];
    /** Current equipment per player (from server); used to compute replaceItemIds when equipping. */
    playerEquipmentByPlayer?: Record<string, string[]>;
    /** Votes per group vote (voteId -> playerId -> optionId); synced from server. */
    groupVoteVotes?: Record<string, Record<string, string>>;
    onPhaseChange?: (phase: string, gameState: Record<string, unknown>) => void;
    /** Lets the lobby UI hide battle-only chrome immediately when Start Game is clicked. */
    onBattleStartStatusChange?: (starting: boolean) => void;
}

export default function PreMissionStoryPhase({
    api,
    playerId,
    isHost,
    missionId,
    players,
    characterSelections = {},
    preMissionStory,
    storyReadyPlayerIds,
    playerEquipmentByPlayer,
    groupVoteVotes = {},
    onPhaseChange,
    onBattleStartStatusChange,
}: PreMissionStoryPhaseProps) {
    const [phraseIndex, setPhraseIndex] = useState(0);
    const [backgroundImage, setBackgroundImage] = useState<string | undefined>();
    const [bgOpacity, setBgOpacity] = useState(1);
    const [isApplyingGroupVote, setIsApplyingGroupVote] = useState(false);
    const [storyViewportMode, setStoryViewportMode] = useState<StoryViewportLayoutMode>(() =>
        typeof window !== 'undefined' && window.innerHeight < STORY_VIEWPORT_WINDOW_LAPTOP_MAX_PX
            ? 'laptop'
            : 'desktop',
    );

    const phrases = preMissionStory.phrases;
    const currentPhrase = phrases[phraseIndex];
    const isEnd = phraseIndex >= phrases.length;
    const amSpectator = (characterSelections[playerId] ?? '') === SPECTATOR_ID;

    // When this player reaches the end, notify the server so the host can gate "Start Game".
    useEffect(() => {
        if (!isEnd) return;
        api.sendMessage(MessageType.STORY_READY, {}).catch(() => {});
    }, [isEnd, api]);

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

    const handleStoryViewportModeChange = useCallback((mode: StoryViewportLayoutMode) => {
        setStoryViewportMode(mode);
    }, []);

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
        void api
            .sendMessage(MessageType.STORY_GRANT_EQUIPMENT_RANDOM, {
                missionId,
                phraseIndex,
                itemId,
                ...(seedSuffix ? { seedSuffix } : {}),
            })
            .catch(() => {})
            .finally(() => {
                advancePhrase();
            });
    }, [advancePhrase, currentPhrase, isHost, api, missionId, phraseIndex]);

    const handleStartGame = useCallback(async () => {
        onBattleStartStatusChange?.(true);
        try {
            const newGameState = await api.updateGameState({
                gamePhase: 'battle',
            });
            await api.sendMessage(MessageType.GAME_PHASE_CHANGED, {
                gamePhase: 'battle',
            });
            onPhaseChange?.('battle', newGameState as Record<string, unknown>);
        } catch (error) {
            onBattleStartStatusChange?.(false);
            console.error('Failed to start game:', error);
        }
    }, [api, onPhaseChange, onBattleStartStatusChange]);

    const handleChoice = useCallback(
        async (choiceId: string, optionId: string, option?: { action?: { type: string; itemId?: string } }) => {
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
                });
            } catch (error) {
                console.error('Failed to send story choice:', error);
            }
            advancePhrase();
        },
        [api, playerId, playerEquipmentByPlayer, advancePhrase],
    );

    const handleGroupVote = useCallback(
        async (voteId: string, optionId: string) => {
            try {
                await api.sendMessage(MessageType.STORY_GROUP_VOTE, {
                    voteId,
                    phraseIndex,
                    optionId,
                });
            } catch (error) {
                console.error('Failed to send group vote:', error);
            }
        },
        [api, phraseIndex],
    );

    const handleGroupVoteNext = useCallback(async () => {
        if (!currentPhrase || !isGroupVote(currentPhrase)) return;
        setIsApplyingGroupVote(true);
        try {
            const amHostNow = (players[playerId]?.isHost ?? isHost) === true;
            if (amHostNow && currentPhrase.effect) {
                await api.sendMessage(MessageType.STORY_GROUP_VOTE_APPLY, {
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
    }, [currentPhrase, players, playerId, isHost, api, phraseIndex, advancePhrase]);

    const allPlayerIds = Object.keys(players);
    /** Playing players (non-spectators); used for single-player shortcut. */
    const playingPlayerIds = allPlayerIds.filter((id) => (characterSelections[id] ?? '') !== SPECTATOR_ID);
    const singlePlayer = allPlayerIds.length <= 1;
    /** All players (including spectators) must reach the end before host can start. */
    const allReady =
        allPlayerIds.length > 0 &&
        (singlePlayer || allPlayerIds.every((id) => storyReadyPlayerIds.includes(id)));
    const hostCanStart = isHost && allReady;

    if (isEnd) {
        return (
            <PreMissionStoryEndScreen
                isHost={isHost}
                hostCanStart={hostCanStart}
                singlePlayer={singlePlayer}
                onStartGame={handleStartGame}
            />
        );
    }

    if (!currentPhrase) {
        return null;
    }

    const contentJustify = isDialogue(currentPhrase) ? 'end' : 'center';
    const showingDialogue = isDialogue(currentPhrase);
    const dialogueLayoutDensity = storyViewportMode === 'laptop' ? 'laptop' : 'desktop';
    const dialogueLaptopRow = showingDialogue && storyViewportMode === 'laptop';

    const phrasePanel = (
        <StoryPhraseBottomPanel
            phrase={currentPhrase}
            players={players}
            playingPlayerIds={playingPlayerIds}
            allPlayerIds={allPlayerIds}
            playerId={playerId}
            amSpectator={amSpectator}
            groupVoteVotes={groupVoteVotes}
            isApplyingGroupVote={isApplyingGroupVote}
            onAdvance={advancePhrase}
            onChoose={handleChoice}
            onGroupVote={handleGroupVote}
            onGroupVoteNext={handleGroupVoteNext}
            dialogueDensity={dialogueLayoutDensity}
        />
    );

    /** Extra top inset so centered choice/vote cards aren’t flush with the scroll viewport top */
    const phrasePanelWrapDialogue =
        'shrink-0 py-2 sm:py-4 flex flex-col gap-3 sm:gap-4 w-full min-w-0 max-w-full justify-center items-stretch';
    const phrasePanelWrapNonDialogue =
        'shrink-0 pt-8 sm:pt-10 pb-2 sm:pb-4 flex flex-col gap-3 sm:gap-4 w-full min-w-0 max-w-full justify-center items-stretch';

    return (
        <PreMissionStoryLayout
            backgroundImage={backgroundImage}
            bgOpacity={bgOpacity}
            contentJustify={contentJustify}
            onStoryViewportModeChange={handleStoryViewportModeChange}
        >
            {dialogueLaptopRow ? (
                <div className="flex flex-row flex-1 min-h-0 items-stretch gap-2 sm:gap-3 w-full py-1">
                    <DialoguePortraitSidebar phrase={currentPhrase} />
                    <div className="flex-1 min-w-0 flex flex-col justify-center">{phrasePanel}</div>
                </div>
            ) : showingDialogue ? (
                <>
                    <DialoguePortraitRow phrase={currentPhrase} />
                    <div className={phrasePanelWrapDialogue}>{phrasePanel}</div>
                </>
            ) : (
                <div className={phrasePanelWrapNonDialogue}>{phrasePanel}</div>
            )}
        </PreMissionStoryLayout>
    );
}
