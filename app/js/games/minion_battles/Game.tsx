/**
 * Minion Battles - React game component
 * Manages game phases and state, receives props from the lobby.
 *
 * Uses the local-override system so that player interactions (votes,
 * character selections, etc.) appear instantly in the UI without waiting
 * for the server round-trip.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { PlayerState, GameSidebarInfo } from '../../types';
import type { LobbyClient } from '../../LobbyClient';
import type { GameComponentProps } from '../../components/GameScreen';
import { useLocalOverrides } from '../../hooks/useLocalOverrides';
import { useToast } from '../../contexts/ToastContext';
import type { GamePhase } from './state';
import MissionSelectPhase from './ui/pages/MissionSelectPhase';
import CharacterSelectPhase from './ui/pages/CharacterSelectPhase';
import PreMissionStoryPhase from './ui/pages/PreMissionStoryPhase';
import PostMissionStoryPhase from './ui/pages/PostMissionStoryPhase';
import BattlePhase from './ui/pages/BattlePhase';
import { MISSION_MAP } from './storylines';
import { SPECTATOR_ID } from './state';
import { MessageType } from '../../MessageTypes';
import type { CampaignResourceKey } from '../../types';
import VictoryModal from './ui/components/VictoryModal';
import { MinionBattlesApi } from './api/minionBattlesApi';

/** Determine the winning mission from votes (most votes, or first alphabetically on tie). */
function getSelectedMission(votes: Record<string, string>): string {
    const counts: Record<string, number> = {};
    for (const missionId of Object.values(votes)) {
        counts[missionId] = (counts[missionId] ?? 0) + 1;
    }
    let best = 'dark_awakening';
    let bestCount = 0;
    for (const [missionId, count] of Object.entries(counts)) {
        if (count > bestCount || (count === bestCount && missionId < best)) {
            best = missionId;
            bestCount = count;
        }
    }
    return best;
}

interface MinionBattlesGameProps extends Pick<GameComponentProps, 'minionBattlesApi'> {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    isAdmin?: boolean;
    players: Record<string, PlayerState>;
    gameData: Record<string, unknown> | null;
    onSidebarInfoChange?: (info: GameSidebarInfo | null) => void;
    onRecordMissionResult?: (
        missionId: string,
        result: string,
        resourceDelta?: Partial<Record<CampaignResourceKey, number>>,
        grantKnowledgeKeys?: string[],
        itemIds?: string[]
    ) => Promise<void>;
    /** Called when user clicks Leave in the defeat modal. */
    onLeave?: () => void;
    /** Called when user clicks Try Again in the defeat modal; creates a new lobby for the same mission. */
    onTryAgain?: (missionId: string) => Promise<void>;
    /** Called when host sends an emitted message (e.g. NPC chat) so the UI can show it immediately. */
    onEmittedChatMessage?: (entry: import('../../components/Chat').MessageEntry) => void;
    /** Called when the game is about to switch from pre-battle story into battle. */
    onBattleStartStatusChange?: (starting: boolean) => void;
}

export default function MinionBattlesGame({
    minionBattlesApi: minionBattlesApiProp,
    lobbyClient,
    lobbyId,
    gameId,
    playerId,
    isHost,
    isAdmin = false,
    players,
    gameData,
    onSidebarInfoChange,
    onRecordMissionResult,
    onLeave,
    onTryAgain,
    onEmittedChatMessage,
    onBattleStartStatusChange,
}: MinionBattlesGameProps) {
    const { showToast } = useToast();
    const api = useMemo(
        () =>
            minionBattlesApiProp ??
            new MinionBattlesApi(lobbyClient, lobbyId, gameId, playerId),
        [minionBattlesApiProp, lobbyClient, lobbyId, gameId, playerId],
    );
    const [defeatModalOpen, setDefeatModalOpen] = useState(false);
    const [victoryModalOpen, setVictoryModalOpen] = useState(false);
    const raw = gameData ?? {};

    // Infer battle phase when gamePhase is missing but engine state (units, gameTick) exists.
    // This happens when loading from checkpoints that lack phase metadata.
    const inferredPhase = (): GamePhase => {
        const explicit = (raw.gamePhase ?? raw.game_phase) as GamePhase | undefined;
        if (explicit) return explicit;
        const hasBattleData =
            (Array.isArray(raw.units) && raw.units.length > 0) ||
            typeof (raw.gameTick ?? raw.game_tick) === 'number';
        return hasBattleData ? 'battle' : 'mission_select';
    };

    // ---- Server-authoritative state (updated by polling) ------------------
    const [gamePhase, setGamePhase] = useState<GamePhase>(inferredPhase);
    const [missionVotes, setMissionVotes] = useState<Record<string, string>>(
        (raw.missionVotes as Record<string, string>) ??
            (raw.mission_votes as Record<string, string>) ??
            {}
    );
    const [characterSelections, setCharacterSelections] = useState<Record<string, string>>(
        (raw.characterSelections as Record<string, string>) ??
            (raw.character_selections as Record<string, string>) ??
            {}
    );
    /** Player IDs that have reached the end of pre-mission story (for host start-gate). */
    const [storyReadyPlayerIds, setStoryReadyPlayerIds] = useState<string[]>(
        () => (raw.storyReadyPlayerIds as string[] | undefined) ?? []
    );
    /** Player IDs that have clicked Ready on character select (all must be ready to proceed). */
    const [characterSelectReadyPlayerIds, setCharacterSelectReadyPlayerIds] = useState<string[]>(
        () =>
            (raw.characterSelectReadyPlayerIds as string[] | undefined) ??
            (raw.character_select_ready_player_ids as string[] | undefined) ??
            []
    );
    /** Game state returned when transitioning to battle; used as initialGameState (includes playerEquipmentByPlayer). */
    const [phaseChangeGameState, setPhaseChangeGameState] = useState<Record<string, unknown> | null>(null);
    /** Last game state from server (phase transition or poll); used so pre-mission story has current equipment. */
    const [lastGameStateFromServer, setLastGameStateFromServer] = useState<Record<string, unknown> | null>(null);

    // ---- Local overrides for instant feedback -----------------------------
    const localOverrides = useLocalOverrides();

    // Build "effective" state = server state + local overrides.
    // `applyTo`'s reference changes whenever overrides change, which causes
    // this memo to recompute — giving us instant UI updates.
    const effective = useMemo(
        () =>
            localOverrides.applyTo({
                missionVotes,
                characterSelections,
            }),
        [missionVotes, characterSelections, localOverrides.applyTo],
    );

    const selectedMissionId = getSelectedMission(effective.missionVotes as Record<string, string>);
    const missionDef = MISSION_MAP[selectedMissionId];
    const preMissionStory = missionDef?.preMissionStory ?? null;
    const postMissionStory = missionDef?.postMissionStory ?? null;

    /**
     * Starting items granted via pre-mission story (choice equip_item / group vote grant_item_to_player).
     * Derived by intersecting the player's battle-start equipment with the set of possible pre-mission reward items.
     */
    const getStartingItemIdsForPlayer = useCallback(
        (mid: string, pid: string): string[] => {
            const def = MISSION_MAP[mid];
            const pre = def?.preMissionStory as unknown;

            const possible = new Set<string>();
            if (pre && typeof pre === 'object') {
                const phrases = (pre as { phrases?: unknown }).phrases;
                if (Array.isArray(phrases)) {
                    for (const phrase of phrases) {
                        if (!phrase || typeof phrase !== 'object') continue;
                        const p = phrase as Record<string, unknown>;

                        if (p.type === 'choice') {
                            const options = p.options;
                            if (Array.isArray(options)) {
                                for (const opt of options) {
                                    if (!opt || typeof opt !== 'object') continue;
                                    const action = (opt as Record<string, unknown>).action as
                                        | Record<string, unknown>
                                        | undefined;
                                    if (!action) continue;
                                    if (action.type === 'equip_item' && typeof action.itemId === 'string') {
                                        possible.add(action.itemId);
                                    }
                                }
                            }
                        }

                        if (p.type === 'groupVote') {
                            const effect = p.effect as Record<string, unknown> | undefined;
                            if (effect?.type === 'grant_item_to_player' && typeof effect.itemId === 'string') {
                                possible.add(effect.itemId);
                            }
                        }
                    }
                }
            }

            const state = (lastGameStateFromServer ?? raw) as Record<string, unknown>;
            const equipByPlayer = state.playerEquipmentByPlayer as Record<string, string[]> | undefined;
            const equipment = (equipByPlayer?.[pid] ?? []) as string[];
            return [...possible].filter((id) => equipment.includes(id));
        },
        [lastGameStateFromServer, raw]
    );

    /** For battle phase: use phaseChangeGameState when available (host's updateGameState response).
     * This avoids a flash when GameSyncContext later receives checkpoint data — we keep a stable
     * initial state instead of remounting BattlePhase when raw gets units/gameTick. */
    const battleInitState = gamePhase === 'battle' ? (phaseChangeGameState ?? raw) : raw;

    /** Rewards from post-mission choice (for victory screen). */
    const [missionRewards, setMissionRewards] = useState<{
        resourceDelta?: Partial<Record<CampaignResourceKey, number>>;
        itemFromFirstChoice?: string;
    } | null>(null);

    // ---- Sync from gameData (GameSyncContext owns fetching; gameData flows from there) ----
    useEffect(() => {
        const gd = gameData ?? {};
        if (!gd || Object.keys(gd).length === 0) return;

        setLastGameStateFromServer(gd);
        let newPhase = (gd.gamePhase ?? gd.game_phase) as GamePhase | undefined;
        if (!newPhase) {
            const hasBattleData =
                (Array.isArray(gd.units) && gd.units.length > 0) ||
                typeof (gd.gameTick ?? gd.game_tick) === 'number';
            if (hasBattleData) newPhase = 'battle';
        }
        const newVotes = (gd.missionVotes ?? gd.mission_votes) as Record<string, string> | undefined;
        const newCharSel = (gd.characterSelections ?? gd.character_selections) as Record<string, string> | undefined;
        const newStoryReady = (gd.storyReadyPlayerIds as string[] | undefined) ?? [];
        const newReady =
            (gd.characterSelectReadyPlayerIds as string[] | undefined) ??
            (gd.character_select_ready_player_ids as string[] | undefined) ??
            [];
        if (newPhase) setGamePhase(newPhase);
        if (newVotes) setMissionVotes(newVotes);
        if (newCharSel) setCharacterSelections(newCharSel);
        setStoryReadyPlayerIds(newStoryReady);
        setCharacterSelectReadyPlayerIds(newReady);

        localOverrides.reconcile({
            missionVotes: newVotes ?? {},
            characterSelections: newCharSel ?? {},
        });
    }, [gameData, localOverrides.reconcile]);

    // ---- Phase transitions ------------------------------------------------
    const handlePhaseChange = useCallback(
        (phase: string, newGameState: Record<string, unknown>) => {
            // Phase changed — clear all local overrides since the game state
            // is being replaced wholesale by the server.
            localOverrides.clear();

            setGamePhase(phase as GamePhase);
            if (phase === 'battle' && newGameState) {
                setPhaseChangeGameState(newGameState);
            } else {
                setPhaseChangeGameState(null);
            }
            if (newGameState) {
                setLastGameStateFromServer(newGameState);
                const nv = (newGameState.missionVotes ?? newGameState.mission_votes) as
                    | Record<string, string>
                    | undefined;
                if (nv) setMissionVotes(nv);
                const nc = (newGameState.characterSelections ?? newGameState.character_selections) as
                    | Record<string, string>
                    | undefined;
                if (nc) setCharacterSelections(nc);
                const sr = (newGameState.storyReadyPlayerIds as string[] | undefined) ?? [];
                setStoryReadyPlayerIds(sr);
                const ready =
                    (newGameState.characterSelectReadyPlayerIds as string[] | undefined) ??
                    (newGameState.character_select_ready_player_ids as string[] | undefined) ??
                    [];
                setCharacterSelectReadyPlayerIds(ready);
            }
        },
        [localOverrides.clear],
    );

    return (
        <div className={`w-full h-full ${gamePhase === 'battle' ? 'overflow-hidden' : 'overflow-auto'}`}>
            {gamePhase === 'mission_select' && (
                <MissionSelectPhase
                    api={api}
                    playerId={playerId}
                    isHost={isHost}
                    players={players}
                    missionVotes={effective.missionVotes as Record<string, string>}
                    setLocalOverride={localOverrides.set}
                    removeLocalOverride={localOverrides.remove}
                    onPhaseChange={handlePhaseChange}
                />
            )}
            {gamePhase === 'character_select' && (
                <CharacterSelectPhase
                    api={api}
                    playerId={playerId}
                    isHost={isHost}
                    isAdmin={isAdmin}
                    players={players}
                    characterSelections={effective.characterSelections as Record<string, string>}
                    characterSelectReadyPlayerIds={characterSelectReadyPlayerIds}
                    missionId={selectedMissionId}
                    campaignId={missionDef?.campaignId}
                    missionDef={missionDef ?? null}
                    preMissionStory={preMissionStory}
                    setLocalOverride={localOverrides.set}
                    removeLocalOverride={localOverrides.remove}
                    onPhaseChange={handlePhaseChange}
                />
            )}
            {gamePhase === 'post_mission_story' && postMissionStory && (
                <PostMissionStoryPhase
                    api={api}
                    playerId={playerId}
                    missionId={selectedMissionId}
                    players={players}
                    characterSelections={effective.characterSelections as Record<string, string>}
                    postMissionStory={postMissionStory}
                    playerEquipmentByPlayer={
                        (lastGameStateFromServer ?? raw).playerEquipmentByPlayer as
                            | Record<string, string[]>
                            | undefined
                    }
                    onComplete={(rewards) => {
                        const missionId = getSelectedMission(effective.missionVotes as Record<string, string>);
                        const missionDef = MISSION_MAP[missionId];
                        const grantKnowledgeKeys = missionDef?.completionRewards?.knowledgeKeys;
                        const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
                        const amSpectator = sel === SPECTATOR_ID;
                        const startingItemIds = amSpectator ? [] : getStartingItemIdsForPlayer(missionId, playerId);
                        const chosenPostItemId = rewards.itemFromFirstChoice;
                        const itemIds = Array.from(
                            new Set([
                                ...startingItemIds,
                                ...(chosenPostItemId ? [chosenPostItemId] : []),
                            ])
                        );
                        void onRecordMissionResult?.(
                            missionId,
                            'victory',
                            amSpectator ? undefined : rewards.resourceDelta,
                            amSpectator ? undefined : grantKnowledgeKeys,
                            amSpectator ? undefined : itemIds,
                        );
                        setMissionRewards({
                            ...rewards,
                            itemFromFirstChoice: rewards.itemFromFirstChoice ?? itemIds[0] ?? undefined,
                        });
                        setVictoryModalOpen(true);
                    }}
                />
            )}
            {gamePhase === 'pre_mission_story' && preMissionStory && (
                <PreMissionStoryPhase
                    api={api}
                    playerId={playerId}
                    isHost={isHost}
                    missionId={selectedMissionId}
                    players={players}
                    characterSelections={effective.characterSelections as Record<string, string>}
                    preMissionStory={preMissionStory}
                    storyReadyPlayerIds={storyReadyPlayerIds}
                    playerEquipmentByPlayer={
                        (lastGameStateFromServer ?? raw).playerEquipmentByPlayer as
                            | Record<string, string[]>
                            | undefined
                    }
                    groupVoteVotes={
                        (lastGameStateFromServer ?? raw).groupVoteVotes as
                            | Record<string, Record<string, string>>
                            | undefined
                    }
                    onPhaseChange={handlePhaseChange}
                    onBattleStartStatusChange={onBattleStartStatusChange}
                />
            )}
            {gamePhase === 'battle' && (
                <BattlePhase
                    key={`battle-${(battleInitState as Record<string, unknown>)?.synchash ?? (battleInitState as Record<string, unknown>)?.gameTick ?? (battleInitState as Record<string, unknown>)?.game_tick ?? 'init'}`}
                    api={api}
                    playerId={playerId}
                    isHost={isHost}
                    players={players}
                    characterSelections={effective.characterSelections as Record<string, string>}
                    missionId={getSelectedMission(effective.missionVotes as Record<string, string>)}
                    initialGameState={battleInitState}
                    onSidebarInfoChange={onSidebarInfoChange}
                    onEmittedChatMessage={onEmittedChatMessage}
                    onVictory={(missionResult) => {
                        const missionId = getSelectedMission(effective.missionVotes as Record<string, string>);
                        if (postMissionStory) {
                            if (isHost) {
                                api
                                    .updateGameState({
                                        gamePhase: 'post_mission_story',
                                    })
                                    .then((newState) => {
                                        handlePhaseChange('post_mission_story', newState as Record<string, unknown>);
                                    })
                                    .catch(() => {});
                                api
                                    .sendMessage(MessageType.GAME_PHASE_CHANGED, {
                                        gamePhase: 'post_mission_story',
                                    })
                                    .catch(() => {});
                            }
                            setGamePhase('post_mission_story');
                        } else {
                            const missionDef = MISSION_MAP[missionId];
                            const grantKnowledgeKeys = missionDef?.completionRewards?.knowledgeKeys;
                            const sel = (effective.characterSelections as Record<string, string>)?.[playerId];
                            const amSpectator = sel === SPECTATOR_ID;
                            const startingItemIds = amSpectator ? [] : getStartingItemIdsForPlayer(missionId, playerId);
                            void onRecordMissionResult?.(
                                missionId,
                                missionResult,
                                undefined,
                                grantKnowledgeKeys,
                                amSpectator ? undefined : startingItemIds
                            );
                            setMissionRewards(
                                amSpectator
                                    ? null
                                    : {
                                          itemFromFirstChoice: startingItemIds[0] ?? undefined,
                                      }
                            );
                            setVictoryModalOpen(true);
                        }
                    }}
                    onDefeat={() => {
                        setDefeatModalOpen(true);
                    }}
                />
            )}
            {defeatModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
                    <div className="bg-surface-light border border-border-custom rounded-lg shadow-xl p-10 mx-4 text-center min-h-[35vh] w-[min(90%, 28rem)] flex flex-col justify-center">
                        <h2 className="text-2xl font-bold text-danger mb-2">Defeat!</h2>
                        <p className="text-muted mb-6">You have succumbed to the darkness</p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                                type="button"
                                className="px-4 py-2 bg-dark-600 hover:bg-dark-500 text-white font-medium rounded transition-colors"
                                onClick={() => {
                                    setDefeatModalOpen(false);
                                    onLeave?.();
                                }}
                            >
                                Leave
                            </button>
                            <button
                                type="button"
                                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white font-medium rounded transition-colors"
                                onClick={() => {
                                    setDefeatModalOpen(false);
                                    const missionId = getSelectedMission(effective.missionVotes as Record<string, string>);
                                    void onTryAgain?.(missionId);
                                }}
                            >
                                Try again
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {victoryModalOpen && (
                <VictoryModal
                    missionRewards={missionRewards}
                    onClose={() => {
                        setVictoryModalOpen(false);
                        setMissionRewards(null);
                        onLeave?.();
                    }}
                />
            )}
            {gamePhase !== 'mission_select' &&
                gamePhase !== 'character_select' &&
                gamePhase !== 'pre_mission_story' &&
                gamePhase !== 'battle' &&
                gamePhase !== 'post_mission_story' && (
                    <div className="text-center p-5">
                        <h2 className="text-2xl font-bold">Minion Battles</h2>
                        <p className="text-muted mt-2">Phase: {gamePhase}</p>
                    </div>
                )}
        </div>
    );
}
