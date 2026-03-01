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
import { LobbyClient } from '../../LobbyClient';
import { useLocalOverrides } from '../../hooks/useLocalOverrides';
import { useToast } from '../../contexts/ToastContext';
import type { GamePhase } from './state';
import MissionSelectPhase from './phases/MissionSelectPhase';
import CharacterSelectPhase from './phases/CharacterSelectPhase';
import PreMissionStoryPhase from './phases/PreMissionStoryPhase';
import BattlePhase from './phases/BattlePhase';
import { MISSION_MAP } from './storylines';

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

interface MinionBattlesGameProps {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    gameData: Record<string, unknown> | null;
    onSidebarInfoChange?: (info: GameSidebarInfo | null) => void;
    onRecordMissionResult?: (missionId: string, result: string) => Promise<void>;
    /** Called when user clicks Leave in the defeat modal. */
    onLeave?: () => void;
    /** Called when user clicks Try Again in the defeat modal; creates a new lobby for the same mission. */
    onTryAgain?: (missionId: string) => Promise<void>;
}

export default function MinionBattlesGame({
    lobbyClient,
    lobbyId,
    gameId,
    playerId,
    isHost,
    players,
    gameData,
    onSidebarInfoChange,
    onRecordMissionResult,
    onLeave,
    onTryAgain,
}: MinionBattlesGameProps) {
    const { showToast } = useToast();
    const [defeatModalOpen, setDefeatModalOpen] = useState(false);
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
    /** Game state returned when transitioning to battle (includes playerStoryChoices); used as initialGameState so story choices apply. */
    const [phaseChangeGameState, setPhaseChangeGameState] = useState<Record<string, unknown> | null>(null);

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

    // ---- Polling ----------------------------------------------------------
    // Periodically refresh game state from server
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const { gameState } = await lobbyClient.getLobbyState(lobbyId, playerId);
                const gd = (gameState as { game?: Record<string, unknown> }).game;
                if (gd) {
                    let newPhase = (gd.gamePhase ?? gd.game_phase) as GamePhase | undefined;
                    if (!newPhase) {
                        const hasBattleData =
                            (Array.isArray(gd.units) && gd.units.length > 0) ||
                            typeof (gd.gameTick ?? gd.game_tick) === 'number';
                        if (hasBattleData) newPhase = 'battle';
                    }
                    const newVotes = (gd.missionVotes ?? gd.mission_votes) as
                        | Record<string, string>
                        | undefined;
                    const newCharSel = (gd.characterSelections ?? gd.character_selections) as
                        | Record<string, string>
                        | undefined;
                    if (newPhase) setGamePhase(newPhase);
                    if (newVotes) setMissionVotes(newVotes);
                    if (newCharSel) setCharacterSelections(newCharSel);

                    // Reconcile local overrides: any override whose value now
                    // matches the server is automatically pruned.
                    localOverrides.reconcile({
                        missionVotes: newVotes ?? {},
                        characterSelections: newCharSel ?? {},
                    });
                }
            } catch {
                // Silently fail
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [lobbyClient, lobbyId, playerId, localOverrides.reconcile]);

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
                const nv = (newGameState.missionVotes ?? newGameState.mission_votes) as
                    | Record<string, string>
                    | undefined;
                if (nv) setMissionVotes(nv);
                const nc = (newGameState.characterSelections ?? newGameState.character_selections) as
                    | Record<string, string>
                    | undefined;
                if (nc) setCharacterSelections(nc);
            }
        },
        [localOverrides.clear],
    );

    return (
        <div className={`w-full h-full ${gamePhase === 'battle' ? 'overflow-hidden' : 'overflow-auto'}`}>
            {gamePhase === 'mission_select' && (
                <MissionSelectPhase
                    lobbyClient={lobbyClient}
                    lobbyId={lobbyId}
                    gameId={gameId}
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
                    lobbyClient={lobbyClient}
                    lobbyId={lobbyId}
                    gameId={gameId}
                    playerId={playerId}
                    isHost={isHost}
                    players={players}
                    characterSelections={effective.characterSelections as Record<string, string>}
                    missionId={selectedMissionId}
                    preMissionStory={preMissionStory}
                    setLocalOverride={localOverrides.set}
                    removeLocalOverride={localOverrides.remove}
                    onPhaseChange={handlePhaseChange}
                />
            )}
            {gamePhase === 'pre_mission_story' && preMissionStory && (
                <PreMissionStoryPhase
                    lobbyClient={lobbyClient}
                    lobbyId={lobbyId}
                    gameId={gameId}
                    playerId={playerId}
                    isHost={isHost}
                    players={players}
                    preMissionStory={preMissionStory}
                    onPhaseChange={handlePhaseChange}
                />
            )}
            {gamePhase === 'battle' && (
                <>
                    <BattlePhase
                        lobbyClient={lobbyClient}
                        lobbyId={lobbyId}
                        gameId={gameId}
                        playerId={playerId}
                        isHost={isHost}
                        players={players}
                        characterSelections={effective.characterSelections as Record<string, string>}
                        missionId={getSelectedMission(effective.missionVotes as Record<string, string>)}
                        initialGameState={phaseChangeGameState ?? raw}
                        onSidebarInfoChange={onSidebarInfoChange}
                        onVictory={() => {
                            const missionId = getSelectedMission(effective.missionVotes as Record<string, string>);
                            void onRecordMissionResult?.(missionId, 'victory').then(() =>
                                showToast('Victory!', 'success')
                            );
                        }}
                        onDefeat={() => {
                            void onRecordMissionResult?.(
                                getSelectedMission(effective.missionVotes as Record<string, string>),
                                'defeat'
                            );
                            setDefeatModalOpen(true);
                        }}
                    />
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
                </>
            )}
            {gamePhase !== 'mission_select' &&
                gamePhase !== 'character_select' &&
                gamePhase !== 'pre_mission_story' &&
                gamePhase !== 'battle' && (
                    <div className="text-center p-5">
                        <h2 className="text-2xl font-bold">Minion Battles</h2>
                        <p className="text-muted mt-2">Phase: {gamePhase}</p>
                    </div>
                )}
        </div>
    );
}
