/**
 * Minion Battles - game entrypoint. The gameContainer will contain the UI & entrypoint for the game.
 * Extends BaseGame with createInitialState (lobbyId, players, hands) and instance getters for state.
 */

import { BaseGame } from '../base.js';
import type { MinionBattlesState, MinionBattlesGameOptions, GamePhase } from './state.js';
import { MissionSelectPhase } from './phases/MissionSelectPhase.js';
import { CharacterSelectPhase } from './phases/CharacterSelectPhase.js';
import type { PlayerState } from '../../types.js';
import { LobbyClient } from '../../LobbyClient.js';
import { MessageType } from '../../MessageTypes.js';

export interface MinionBattlesInitialState extends MinionBattlesState {
    lobbyId: string;
    players: string[];
    hands: Record<string, string[]>;
}

export default class MinionBattlesGame extends BaseGame {
    private container: HTMLElement;
    private state: MinionBattlesState;
    private missionSelectPhase: MissionSelectPhase | null = null;
    private characterSelectPhase: CharacterSelectPhase | null = null;
    private lobbyClient: LobbyClient;
    private _lobbyId: string;
    private gameId: string;
    private playerId: string;
    private isHost: boolean;
    private _players: Record<string, PlayerState>;

    constructor(container: HTMLElement, options: MinionBattlesGameOptions = {}) {
        super();
        this.container = container;
        this.container.classList.add('minion-battles-game');
        const raw = options.gameData ?? {};
        this.state = {
            lobbyId: (raw.lobby_id as string) ?? (raw.lobbyId as string),
            lobby_id: raw.lobby_id as string | undefined,
            players: (raw.players as string[]) ?? [],
            hands: (raw.hands as Record<string, string[]>) ?? {},
            gamePhase: (raw.gamePhase as GamePhase) ?? (raw.game_phase as GamePhase) ?? 'mission_select',
            game_phase: raw.game_phase as GamePhase | undefined,
            missionVotes: (raw.missionVotes as Record<string, string>) ?? (raw.mission_votes as Record<string, string>) ?? {},
            mission_votes: raw.mission_votes as Record<string, string> | undefined,
        };

        // Get lobby client and player info from window.app
        const app = (window as { app?: { lobbyClient?: LobbyClient; currentLobby?: { id: string }; currentPlayer?: PlayerState; players?: Record<string, PlayerState>; lobbyGameId?: string | null } }).app;
        this.lobbyClient = app?.lobbyClient ?? new LobbyClient();
        this._lobbyId = app?.currentLobby?.id ?? this.state.lobbyId ?? '';
        this.gameId = app?.lobbyGameId ?? options.gameId ?? '';
        this.playerId = app?.currentPlayer?.id ?? '';
        this.isHost = app?.currentPlayer?.isHost ?? false;
        this._players = app?.players ?? {};
        
        // Update players when they change
        const updatePlayers = () => {
            const currentApp = (window as { app?: { players?: Record<string, PlayerState>; currentPlayer?: PlayerState } }).app;
            if (currentApp?.players) {
                this._players = currentApp.players;
                if (currentApp.currentPlayer) {
                    this.isHost = currentApp.currentPlayer.isHost ?? false;
                }
                if (this.missionSelectPhase) {
                    this.missionSelectPhase.updatePlayers(this._players);
                }
            }
        };
        setInterval(updatePlayers, 1000);

        // Set up message listener
        this.setupMessageListener();

        this.render();
    }

    /** Initial state shape for a new Minion Battles game (server uses this shape). */
    static createInitialState(lobbyId: string, playerIds: string[]): MinionBattlesInitialState {
        const base = super.createInitialState(lobbyId, playerIds);
        const hands: Record<string, string[]> = {};
        for (const pid of playerIds) {
            hands[pid] = [];
        }
        return {
            ...base,
            hands,
        };
    }

    get lobbyId(): string {
        return this.state.lobbyId ?? this.state.lobby_id ?? '';
    }

    get players(): string[] {
        return this.state.players ?? [];
    }

    get hands(): Record<string, string[]> {
        return this.state.hands ?? {};
    }

    get gamePhase(): GamePhase {
        return this.state.gamePhase ?? this.state.game_phase ?? 'mission_select';
    }

    get missionVotes(): Record<string, string> {
        return this.state.missionVotes ?? this.state.mission_votes ?? {};
    }

    private setupMessageListener(): void {
        // Listen for game phase changes and mission votes
        const checkForUpdates = () => {
            const app = (window as { app?: { lastMessageId?: number | null; pollMessages?: () => Promise<void> } }).app;
            // Messages are handled via polling in GameApp, but we can also check game state updates
        };

        // Check for updates periodically (messages come via polling, but we can also refresh state)
        setInterval(() => {
            this.refreshGameState();
        }, 2000);
    }

    private async refreshGameState(): Promise<void> {
        try {
            const app = (window as { app?: { lobbyClient?: LobbyClient; currentLobby?: { id: string }; currentPlayer?: PlayerState; players?: Record<string, PlayerState> } }).app;
            if (!app?.lobbyClient || !app?.currentLobby || !app?.currentPlayer) return;

            const { gameState } = await app.lobbyClient.getLobbyState(app.currentLobby.id, app.currentPlayer.id);
            const gameData = (gameState as { game?: Record<string, unknown> }).game;
            
            // Update players
            if (app.players) {
                this._players = app.players;
            }
            
            if (gameData) {
                const newPhase = (gameData.gamePhase ?? gameData.game_phase) as GamePhase | undefined;
                const newVotes = (gameData.missionVotes ?? gameData.mission_votes) as Record<string, string> | undefined;
                
                if (newPhase && newPhase !== this.gamePhase) {
                    this.state.gamePhase = newPhase;
                    this.state.game_phase = newPhase;
                    this.render();
                }
                
                if (newVotes) {
                    this.state.missionVotes = newVotes;
                    this.state.mission_votes = newVotes;
                    if (this.missionSelectPhase) {
                        await this.missionSelectPhase.updateMissionVotes(newVotes);
                    }
                }
            }
        } catch (error) {
            // Silently fail - polling will handle updates
        }
    }

    updateFromMessage(type: string, data: Record<string, unknown>): void {
        if (type === MessageType.MISSION_VOTE) {
            const playerId = data.playerId as string;
            const missionId = data.missionId as string;
            if (playerId && missionId) {
                const votes = { ...this.missionVotes };
                votes[playerId] = missionId;
                this.state.missionVotes = votes;
                this.state.mission_votes = votes;
                if (this.missionSelectPhase) {
                    // Fire and forget - async operation
                    this.missionSelectPhase.updateMissionVotes(votes).catch(err => {
                        console.error('Error updating mission votes:', err);
                    });
                }
            }
        } else if (type === MessageType.GAME_PHASE_CHANGED) {
            const newPhase = data.gamePhase as GamePhase;
            if (newPhase) {
                this.state.gamePhase = newPhase;
                this.state.game_phase = newPhase;
                this.render();
            }
        }
    }

    private render(): void {
        this.container.innerHTML = '';
        const phaseContainer = document.createElement('div');
        phaseContainer.className = 'phase-container';
        this.container.appendChild(phaseContainer);

        // Clean up previous phases
        if (this.missionSelectPhase) {
            this.missionSelectPhase.destroy();
            this.missionSelectPhase = null;
        }
        if (this.characterSelectPhase) {
            this.characterSelectPhase.destroy();
            this.characterSelectPhase = null;
        }

        const phase = this.gamePhase;

        if (phase === 'mission_select') {
            this.missionSelectPhase = new MissionSelectPhase(
                phaseContainer,
                this.lobbyClient,
                this._lobbyId,
                this.gameId,
                this.playerId,
                this.isHost,
                this._players,
                this.missionVotes,
                (newPhase, newGameState) => {
                    // Ingest the returned game state
                    if (newGameState) {
                        this.state = {
                            ...this.state,
                            ...newGameState,
                            gamePhase: (newGameState.gamePhase ?? newGameState.game_phase) as GamePhase,
                            game_phase: (newGameState.gamePhase ?? newGameState.game_phase) as GamePhase,
                            missionVotes: (newGameState.missionVotes ?? newGameState.mission_votes) as Record<string, string> ?? this.missionVotes,
                            mission_votes: (newGameState.missionVotes ?? newGameState.mission_votes) as Record<string, string> ?? this.missionVotes,
                        };
                    } else {
                        this.state.gamePhase = newPhase as GamePhase;
                        this.state.game_phase = newPhase as GamePhase;
                    }
                    this.render();
                }
            );
        } else if (phase === 'character_select') {
            this.characterSelectPhase = new CharacterSelectPhase(phaseContainer);
        } else {
            phaseContainer.innerHTML = `
                <div class="game-container minion-battles">
                    <h2>Minion Battles</h2>
                    <p>Phase: ${phase}</p>
                </div>
            `;
        }
    }

    /** Optional: cleanup when game is unmounted */
    destroy(): void {
        if (this.missionSelectPhase) {
            this.missionSelectPhase.destroy();
        }
        if (this.characterSelectPhase) {
            this.characterSelectPhase.destroy();
        }
        this.container.innerHTML = '';
        this.container.classList.remove('minion-battles-game');
    }
}
