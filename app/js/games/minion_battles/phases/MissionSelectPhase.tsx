/**
 * Mission Select Phase - React component for mission voting
 */
import React, { useCallback } from 'react';
import type { PlayerState } from '../../../types';
import { LobbyClient } from '../../../LobbyClient';
import { MessageType } from '../../../MessageTypes';

export interface Mission {
    id: string;
    title: string;
    description: string;
    heroImage: string;
}

const MISSIONS: Mission[] = [
    {
        id: 'dark_awakening',
        title: 'A Dark Awakening',
        description:
            "The players will wake up in the darkness around a campfire. They don't know where they are, and they can't see anything in the darkness. They'll need to light a torch and head out.",
        heroImage: generateDarkAwakeningSVG(),
    },
    {
        id: 'last_holdout',
        title: 'The Last Holdout',
        description: 'The players will need to defend a bunker from the dark hordes.',
        heroImage: generateLastHoldoutSVG(),
    },
];

function generateDarkAwakeningSVG(): string {
    return `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="darkAwakeningFireGrad" cx="50%" cy="50%"><stop offset="0%" style="stop-color:#ff6b00;stop-opacity:1" /><stop offset="50%" style="stop-color:#ff8c00;stop-opacity:0.8" /><stop offset="100%" style="stop-color:#ffaa00;stop-opacity:0.3" /></radialGradient><radialGradient id="darkAwakeningDarkGrad" cx="50%" cy="50%"><stop offset="0%" style="stop-color:#000000;stop-opacity:0.9" /><stop offset="100%" style="stop-color:#1a1a2e;stop-opacity:1" /></radialGradient></defs><rect width="400" height="300" fill="url(#darkAwakeningDarkGrad)"/><circle cx="200" cy="200" r="30" fill="url(#darkAwakeningFireGrad)"/><circle cx="200" cy="200" r="20" fill="#ffaa00" opacity="0.6"/><ellipse cx="195" cy="185" rx="8" ry="15" fill="#ff6b00" opacity="0.8"/><ellipse cx="200" cy="180" rx="6" ry="12" fill="#ff8c00" opacity="0.9"/><ellipse cx="205" cy="185" rx="8" ry="15" fill="#ff6b00" opacity="0.8"/><ellipse cx="170" cy="210" rx="15" ry="25" fill="#000000" opacity="0.6"/><ellipse cx="230" cy="210" rx="15" ry="25" fill="#000000" opacity="0.6"/><circle cx="100" cy="50" r="1.5" fill="#ffffff" opacity="0.8"/><circle cx="150" cy="80" r="1" fill="#ffffff" opacity="0.6"/><circle cx="250" cy="60" r="1.5" fill="#ffffff" opacity="0.8"/><circle cx="300" cy="90" r="1" fill="#ffffff" opacity="0.6"/></svg>`;
}

function generateLastHoldoutSVG(): string {
    return `<svg width="400" height="300" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="lastHoldoutBunkerGrad" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" style="stop-color:#4a4a4a;stop-opacity:1" /><stop offset="100%" style="stop-color:#2a2a2a;stop-opacity:1" /></linearGradient><radialGradient id="lastHoldoutMoonGrad" cx="50%" cy="50%"><stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.9" /><stop offset="100%" style="stop-color:#888888;stop-opacity:0.5" /></radialGradient></defs><rect width="400" height="300" fill="#1a1a2e"/><circle cx="320" cy="60" r="25" fill="url(#lastHoldoutMoonGrad)" opacity="0.7"/><rect x="100" y="150" width="200" height="100" fill="url(#lastHoldoutBunkerGrad)"/><rect x="120" y="170" width="30" height="40" fill="#1a1a2e"/><rect x="250" y="170" width="30" height="40" fill="#1a1a2e"/><polygon points="90,150 200,120 310,150" fill="#3a3a3a"/><ellipse cx="50" cy="220" rx="20" ry="30" fill="#000000" opacity="0.7"/><ellipse cx="350" cy="230" rx="25" ry="35" fill="#000000" opacity="0.7"/><ellipse cx="30" cy="250" rx="15" ry="25" fill="#000000" opacity="0.6"/><ellipse cx="370" cy="240" rx="18" ry="28" fill="#000000" opacity="0.6"/><rect x="0" y="250" width="400" height="50" fill="#2a2a2a"/></svg>`;
}

interface MissionSelectPhaseProps {
    lobbyClient: LobbyClient;
    lobbyId: string;
    gameId: string;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    missionVotes: Record<string, string>;
    onPhaseChange?: (phase: string, gameState: Record<string, unknown>) => void;
}

export default function MissionSelectPhase({
    lobbyClient,
    lobbyId,
    gameId,
    playerId,
    isHost,
    players,
    missionVotes,
    onPhaseChange,
}: MissionSelectPhaseProps) {
    const playerVote = missionVotes[playerId];
    const allPlayerIds = Object.keys(players);
    const allVoted = allPlayerIds.every((pid) => pid in missionVotes);
    const firstVote =
        allPlayerIds.length > 0 && allPlayerIds[0] in missionVotes ? missionVotes[allPlayerIds[0]] : null;
    const allSame = !!firstVote && allPlayerIds.every((pid) => missionVotes[pid] === firstVote);

    const handleMissionClick = useCallback(
        async (missionId: string) => {
            try {
                await lobbyClient.sendMessage(lobbyId, playerId, MessageType.MISSION_VOTE, {
                    missionId,
                });
            } catch (error) {
                console.error('Failed to vote for mission:', error);
            }
        },
        [lobbyClient, lobbyId, playerId]
    );

    // Host auto-transitions when all vote the same
    React.useEffect(() => {
        if (!isHost || !allVoted || !allSame) return;

        (async () => {
            try {
                const newGameState = await lobbyClient.updateGameState(lobbyId, gameId, playerId, {
                    gamePhase: 'character_select',
                });
                await lobbyClient.sendMessage(lobbyId, playerId, MessageType.GAME_PHASE_CHANGED, {
                    gamePhase: 'character_select',
                });
                if (onPhaseChange) {
                    onPhaseChange('character_select', newGameState);
                }
            } catch (error) {
                console.error('Failed to update game phase:', error);
            }
        })();
    }, [isHost, allVoted, allSame, lobbyClient, lobbyId, gameId, playerId, onPhaseChange]);

    return (
        <div className="w-full p-5 max-w-[1200px] mx-auto">
            <h2 className="text-[32px] font-bold text-center mb-8">Select a Mission</h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(400px,1fr))] gap-6 mt-5">
                {MISSIONS.map((mission) => {
                    const votes = Object.entries(missionVotes)
                        .filter(([, mid]) => mid === mission.id)
                        .map(([pid]) => pid);
                    const isSelected = playerVote === mission.id;

                    return (
                        <div
                            key={mission.id}
                            className={`bg-surface border-2 rounded-lg p-6 cursor-pointer transition-all flex flex-col gap-4 hover:-translate-y-1 hover:shadow-[0_8px_16px_rgba(0,0,0,0.4)] ${
                                isSelected
                                    ? 'border-primary bg-surface-light shadow-[0_4px_12px_rgba(78,205,196,0.3)]'
                                    : 'border-border-custom hover:border-primary'
                            }`}
                            onClick={() => handleMissionClick(mission.id)}
                        >
                            <div
                                className="w-full rounded overflow-hidden bg-background"
                                dangerouslySetInnerHTML={{ __html: mission.heroImage }}
                            />
                            <h3 className="text-2xl font-semibold m-0">{mission.title}</h3>
                            <p className="text-base text-muted leading-relaxed m-0 flex-1">
                                {mission.description}
                            </p>
                            <div className="flex items-center justify-between pt-3 border-t border-border-custom">
                                <div className="flex gap-2 flex-wrap">
                                    {votes.map((pid) => {
                                        const player = players[pid];
                                        return (
                                            <div
                                                key={pid}
                                                className="w-6 h-6 rounded-full border-2 border-border-custom"
                                                style={{
                                                    backgroundColor: player?.color || '#888',
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                                <span className="text-sm text-muted font-medium">
                                    {votes.length} / {allPlayerIds.length}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
            {allVoted && allSame && (
                <p className="text-center mt-6 p-4 bg-success text-white rounded font-medium">
                    All players have voted! Transitioning to character select...
                </p>
            )}
        </div>
    );
}
