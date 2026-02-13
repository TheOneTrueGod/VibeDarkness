/**
 * Mission Select Phase - displays available missions and handles voting
 */

import type { PlayerState } from '../../../types.js';
import { LobbyClient } from '../../../LobbyClient.js';
import { MessageType } from '../../../MessageTypes.js';

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
        description: 'The players will wake up in the darkness around a campfire. They don\'t know where they are, and they can\'t see anything in the darkness. They\'ll need to light a torch and head out.',
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
    return `
        <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="darkAwakeningFireGrad" cx="50%" cy="50%">
                    <stop offset="0%" style="stop-color:#ff6b00;stop-opacity:1" />
                    <stop offset="50%" style="stop-color:#ff8c00;stop-opacity:0.8" />
                    <stop offset="100%" style="stop-color:#ffaa00;stop-opacity:0.3" />
                </radialGradient>
                <radialGradient id="darkAwakeningDarkGrad" cx="50%" cy="50%">
                    <stop offset="0%" style="stop-color:#000000;stop-opacity:0.9" />
                    <stop offset="100%" style="stop-color:#1a1a2e;stop-opacity:1" />
                </radialGradient>
            </defs>
            <!-- Dark background -->
            <rect width="400" height="300" fill="url(#darkAwakeningDarkGrad)"/>
            <!-- Campfire circle -->
            <circle cx="200" cy="200" r="30" fill="url(#darkAwakeningFireGrad)"/>
            <circle cx="200" cy="200" r="20" fill="#ffaa00" opacity="0.6"/>
            <!-- Fire flames -->
            <ellipse cx="195" cy="185" rx="8" ry="15" fill="#ff6b00" opacity="0.8"/>
            <ellipse cx="200" cy="180" rx="6" ry="12" fill="#ff8c00" opacity="0.9"/>
            <ellipse cx="205" cy="185" rx="8" ry="15" fill="#ff6b00" opacity="0.8"/>
            <!-- Silhouettes around fire -->
            <ellipse cx="170" cy="210" rx="15" ry="25" fill="#000000" opacity="0.6"/>
            <ellipse cx="230" cy="210" rx="15" ry="25" fill="#000000" opacity="0.6"/>
            <!-- Stars -->
            <circle cx="100" cy="50" r="1.5" fill="#ffffff" opacity="0.8"/>
            <circle cx="150" cy="80" r="1" fill="#ffffff" opacity="0.6"/>
            <circle cx="250" cy="60" r="1.5" fill="#ffffff" opacity="0.8"/>
            <circle cx="300" cy="90" r="1" fill="#ffffff" opacity="0.6"/>
        </svg>
    `.trim();
}

function generateLastHoldoutSVG(): string {
    return `
        <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="lastHoldoutBunkerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style="stop-color:#4a4a4a;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#2a2a2a;stop-opacity:1" />
                </linearGradient>
                <radialGradient id="lastHoldoutMoonGrad" cx="50%" cy="50%">
                    <stop offset="0%" style="stop-color:#ffffff;stop-opacity:0.9" />
                    <stop offset="100%" style="stop-color:#888888;stop-opacity:0.5" />
                </radialGradient>
            </defs>
            <!-- Dark sky -->
            <rect width="400" height="300" fill="#1a1a2e"/>
            <!-- Moon -->
            <circle cx="320" cy="60" r="25" fill="url(#lastHoldoutMoonGrad)" opacity="0.7"/>
            <!-- Bunker structure -->
            <rect x="100" y="150" width="200" height="100" fill="url(#lastHoldoutBunkerGrad)"/>
            <rect x="120" y="170" width="30" height="40" fill="#1a1a2e"/>
            <rect x="250" y="170" width="30" height="40" fill="#1a1a2e"/>
            <!-- Bunker top -->
            <polygon points="90,150 200,120 310,150" fill="#3a3a3a"/>
            <!-- Dark horde shadows -->
            <ellipse cx="50" cy="220" rx="20" ry="30" fill="#000000" opacity="0.7"/>
            <ellipse cx="350" cy="230" rx="25" ry="35" fill="#000000" opacity="0.7"/>
            <ellipse cx="30" cy="250" rx="15" ry="25" fill="#000000" opacity="0.6"/>
            <ellipse cx="370" cy="240" rx="18" ry="28" fill="#000000" opacity="0.6"/>
            <!-- Ground -->
            <rect x="0" y="250" width="400" height="50" fill="#2a2a2a"/>
        </svg>
    `.trim();
}

export class MissionSelectPhase {
    private container: HTMLElement;
    private lobbyClient: LobbyClient;
    private lobbyId: string;
    private gameId: string;
    private playerId: string;
    private isHost: boolean;
    private players: Record<string, PlayerState>;
    private missionVotes: Record<string, string> = {};
    private onPhaseChange?: (phase: string, gameState: Record<string, unknown>) => void;

    constructor(
        container: HTMLElement,
        lobbyClient: LobbyClient,
        lobbyId: string,
        gameId: string,
        playerId: string,
        isHost: boolean,
        players: Record<string, PlayerState>,
        missionVotes: Record<string, string> = {},
        onPhaseChange?: (phase: string, gameState: Record<string, unknown>) => void
    ) {
        this.container = container;
        this.lobbyClient = lobbyClient;
        this.lobbyId = lobbyId;
        this.gameId = gameId;
        this.playerId = playerId;
        this.isHost = isHost;
        this.players = players;
        this.missionVotes = missionVotes;
        this.onPhaseChange = onPhaseChange;
        this.render();
    }

    async updateMissionVotes(votes: Record<string, string>): Promise<void> {
        this.missionVotes = votes;
        
        // Check if host should update phase
        if (this.isHost) {
            const allPlayers = Object.keys(this.players);
            const allVoted = allPlayers.every(pid => pid in this.missionVotes);
            if (allVoted) {
                const firstVote = allPlayers.length > 0 && allPlayers[0] in this.missionVotes 
                    ? this.missionVotes[allPlayers[0]] 
                    : null;
                const allSame = firstVote && allPlayers.every(pid => this.missionVotes[pid] === firstVote);
                
                if (allSame) {
                    // Host updates game phase to character_select
                    try {
                        const newGameState = await this.lobbyClient.updateGameState(
                            this.lobbyId,
                            this.gameId,
                            this.playerId,
                            { gamePhase: 'character_select' }
                        );
                        
                        // Send phase change message to notify other players
                        await this.lobbyClient.sendMessage(this.lobbyId, this.playerId, MessageType.GAME_PHASE_CHANGED, {
                            gamePhase: 'character_select',
                        });
                        
                        // Ingest the returned game state
                        if (this.onPhaseChange) {
                            this.onPhaseChange('character_select', newGameState);
                        }
                    } catch (error) {
                        console.error('Failed to update game phase:', error);
                    }
                }
            }
        }
        
        this.render();
    }

    updatePlayers(players: Record<string, PlayerState>): void {
        this.players = players;
        this.render();
    }

    private async handleMissionClick(missionId: string): Promise<void> {
        try {
            await this.lobbyClient.sendMessage(this.lobbyId, this.playerId, MessageType.MISSION_VOTE, {
                missionId,
            });
        } catch (error) {
            console.error('Failed to vote for mission:', error);
        }
    }

    private render(): void {
        const playerVote = this.missionVotes[this.playerId];
        const allPlayers = Object.keys(this.players);
        const allVoted = allPlayers.every(pid => pid in this.missionVotes);
        const firstVote = allPlayers.length > 0 && allPlayers[0] in this.missionVotes 
            ? this.missionVotes[allPlayers[0]] 
            : null;
        const allSame = firstVote && allPlayers.every(pid => this.missionVotes[pid] === firstVote);

        this.container.innerHTML = `
            <div class="mission-select-phase">
                <h2 class="phase-title">Select a Mission</h2>
                <div class="mission-cards">
                    ${MISSIONS.map(mission => {
                        const votes = Object.entries(this.missionVotes)
                            .filter(([_, mid]) => mid === mission.id)
                            .map(([pid, _]) => pid);
                        const isSelected = playerVote === mission.id;
                        
                        return `
                            <div class="mission-card ${isSelected ? 'selected' : ''}" data-mission-id="${mission.id}">
                                <div class="mission-hero">${mission.heroImage}</div>
                                <h3 class="mission-title">${mission.title}</h3>
                                <p class="mission-description">${mission.description}</p>
                                <div class="mission-votes">
                                    <div class="vote-indicators">
                                        ${votes.map(pid => {
                                            const player = this.players[pid];
                                            return `<div class="vote-indicator" style="background-color: ${player?.color || '#888'}"></div>`;
                                        }).join('')}
                                    </div>
                                    <span class="vote-count">${votes.length} / ${allPlayers.length}</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                ${allVoted && allSame ? '<p class="phase-transition-message">All players have voted! Transitioning to character select...</p>' : ''}
            </div>
        `;

        // Add click handlers
        this.container.querySelectorAll('.mission-card').forEach(card => {
            card.addEventListener('click', () => {
                const missionId = card.getAttribute('data-mission-id');
                if (missionId) {
                    this.handleMissionClick(missionId);
                }
            });
        });
    }

    destroy(): void {
        this.container.innerHTML = '';
    }
}
