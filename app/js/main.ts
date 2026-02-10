/**
 * Main Application
 * Ties all components together
 */

import { ChatManager } from './ChatManager.js';
import { GameCanvas } from './GameCanvas.js';
import { LobbyClient } from './LobbyClient.js';
import { UI } from './UI.js';

interface LobbyState {
    id: string;
    name: string;
}

interface PlayerState {
    id: string;
    name: string;
    color: string;
    isHost?: boolean;
    isConnected?: boolean;
}

interface AccountState {
    id: number;
    name: string;
    fire: number;
    water: number;
    earth: number;
    air: number;
}

interface GameStatePayload {
    players: Record<string, PlayerState>;
    clicks: Record<string, { playerId: string; playerName: string; color: string; x: number; y: number }>;
    chatHistory: unknown[];
}

interface PollMessagePayload {
    messageId?: number;
    type: string;
    data: Record<string, unknown>;
}

class GameApp {
    private currentLobby: LobbyState | null = null;
    private currentPlayer: PlayerState | null = null;
    private currentAccount: AccountState | null = null;
    private players: Record<string, PlayerState> = {};
    private lastMessageId: number | null = null;
    private pollIntervalId: ReturnType<typeof setInterval> | null = null;

    private ui: UI;
    private lobbyClient: LobbyClient;
    private chatManager: ChatManager | null = null;
    private gameCanvas: GameCanvas | null = null;

    constructor() {
        this.ui = new UI();
        this.lobbyClient = new LobbyClient();
        this.init();
    }

    private async init(): Promise<void> {
        this.setupUIComponents();
        this.setupEventListeners();
        await this.loadLobbies();
    }

    private setupUIComponents(): void {
        const chatMessages = document.getElementById('chat-messages');
        const chatInput = document.getElementById('chat-input');
        const sendChatBtn = document.getElementById('send-chat-btn');
        const canvasContainer = document.getElementById('game-canvas-container');
        const markersEl = document.getElementById('click-markers');

        if (!chatMessages || !chatInput || !sendChatBtn || !canvasContainer || !markersEl) {
            throw new Error('Required DOM elements not found');
        }

        this.chatManager = new ChatManager(
            chatMessages,
            chatInput as HTMLInputElement,
            sendChatBtn as HTMLButtonElement
        );
        this.gameCanvas = new GameCanvas(canvasContainer, markersEl);

        this.chatManager.on('send', (message: unknown) => {
            if (this.currentLobby && this.currentPlayer) {
                this.lobbyClient
                    .sendMessage(this.currentLobby.id, this.currentPlayer.id, 'chat', {
                        message: message as string,
                    })
                    .catch((err: Error) =>
                        this.ui.showToast('Failed to send: ' + err.message, 'error')
                    );
            }
        });

        this.gameCanvas.on('click', (payload: unknown) => {
            const { x, y } = payload as { x: number; y: number };
            if (this.currentLobby && this.currentPlayer) {
                this.lobbyClient
                    .sendMessage(this.currentLobby.id, this.currentPlayer.id, 'click', { x, y })
                    .catch(() => {});
            }
        });
    }

    private setupEventListeners(): void {
        const createBtn = document.getElementById('create-lobby-btn');
        const joinBtn = document.getElementById('join-lobby-btn');
        const refreshBtn = document.getElementById('refresh-lobbies-btn');
        const leaveBtn = document.getElementById('leave-lobby-btn');
        const lobbyCodeInput = document.getElementById('lobby-code');
        const lobbyNameInput = document.getElementById('lobby-name');

        if (createBtn) createBtn.addEventListener('click', () => this.createLobby());
        if (joinBtn) joinBtn.addEventListener('click', () => this.joinLobbyByCode());
        if (refreshBtn) refreshBtn.addEventListener('click', () => this.loadLobbies());
        if (leaveBtn) leaveBtn.addEventListener('click', () => this.leaveLobby());
        if (lobbyCodeInput) {
            lobbyCodeInput.addEventListener('keypress', (e: KeyboardEvent) => {
                if (e.key === 'Enter') this.joinLobbyByCode();
            });
        }
        if (lobbyNameInput) {
            lobbyNameInput.addEventListener('keypress', (e: KeyboardEvent) => {
                if (e.key === 'Enter') this.createLobby();
            });
        }
    }

    private async loadLobbies(): Promise<void> {
        try {
            const lobbies = await this.lobbyClient.listLobbies();
            this.ui.renderLobbyList(lobbies, (lobbyId: string) => this.joinLobby(lobbyId));
        } catch (error) {
            console.error('Failed to load lobbies:', error);
            this.ui.showToast('Failed to load lobbies', 'error');
        }
    }

    private async createLobby(): Promise<void> {
        const playerName = this.ui.getInputValue('player-name');
        const lobbyName = this.ui.getInputValue('lobby-name');

        if (!playerName) {
            this.ui.showToast('Please enter your name', 'warning');
            return;
        }
        if (!lobbyName) {
            this.ui.showToast('Please enter a lobby name', 'warning');
            return;
        }

        this.ui.setButtonEnabled('create-lobby-btn', false);
        try {
            const account = await this.lobbyClient.signIn(playerName);
            this.currentAccount = account;
            const result = await this.lobbyClient.createLobby(lobbyName, account.id);
            this.currentLobby = result.lobby;
            this.currentPlayer = result.player;
            this.showLobbyScreenWithConnectingState();
            await this.startInLobby();
        } catch (error) {
            console.error('Failed to create lobby:', error);
            this.ui.showToast(
                'Failed to create lobby: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'error'
            );
            this.ui.setButtonEnabled('create-lobby-btn', true);
        }
    }

    private async joinLobby(lobbyId: string): Promise<void> {
        const playerName = this.ui.getInputValue('player-name');
        if (!playerName) {
            this.ui.showToast('Please enter your name', 'warning');
            return;
        }
        try {
            const account = await this.lobbyClient.signIn(playerName);
            this.currentAccount = account;
            const result = await this.lobbyClient.joinLobby(lobbyId, account.id);
            this.currentLobby = result.lobby;
            this.currentPlayer = result.player;
            this.showLobbyScreenWithConnectingState();
            await this.startInLobby();
        } catch (error) {
            console.error('Failed to join lobby:', error);
            this.ui.showToast(
                'Failed to join lobby: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'error'
            );
        }
    }

    private async joinLobbyByCode(): Promise<void> {
        const lobbyCode = this.ui.getInputValue('lobby-code').toUpperCase();
        if (!lobbyCode) {
            this.ui.showToast('Please enter a lobby code', 'warning');
            return;
        }
        await this.joinLobby(lobbyCode);
    }

    private showLobbyScreenWithConnectingState(): void {
        if (!this.currentLobby || !this.currentPlayer) return;
        this.ui.setConnectionStatus('connecting');
        this.ui.showScreen('game-screen');
        this.ui.setLobbyInfo(this.currentLobby.name, this.currentLobby.id);
        this.ui.setPlayerInfo(this.currentPlayer.name, this.currentPlayer.isHost ?? false);
        if (this.currentAccount) {
            this.ui.updateResources(this.currentAccount);
        }
        const initialPlayers: Record<string, PlayerState> = {
            [this.currentPlayer.id]: {
                id: this.currentPlayer.id,
                name: this.currentPlayer.name,
                color: this.currentPlayer.color,
                isHost: this.currentPlayer.isHost,
                isConnected: false,
            },
        };
        this.players = initialPlayers;
        this.ui.updatePlayerList(this.players, this.currentPlayer.id);
        this.chatManager!.setEnabled(false);
    }

    private async startInLobby(): Promise<void> {
        if (!this.currentLobby || !this.currentPlayer) return;
        try {
            const { gameState, lastMessageId } = await this.lobbyClient.getLobbyState(
                this.currentLobby.id,
                this.currentPlayer.id
            );
            this.loadGameState(gameState as GameStatePayload);
            this.lastMessageId = lastMessageId ?? null;
            this.ui.setConnectionStatus('connected');
            this.chatManager!.setEnabled(true);
            this.chatManager!.addSystemMessage('Connected to lobby');
            this.pollIntervalId = setInterval(() => this.pollMessages(), 1000);
        } catch (error) {
            console.error('Failed to load lobby state:', error);
            this.ui.showToast('Failed to load lobby', 'error');
            this.ui.setConnectionStatus('disconnected');
        }
    }

    private async pollMessages(): Promise<void> {
        if (!this.currentLobby || !this.currentPlayer) return;
        try {
            const messages = await this.lobbyClient.getMessages(
                this.currentLobby.id,
                this.currentPlayer.id,
                this.lastMessageId
            );
            for (const msg of messages) {
                this.applyMessage(msg as PollMessagePayload);
                if (
                    msg.messageId != null &&
                    (this.lastMessageId == null || msg.messageId > this.lastMessageId)
                ) {
                    this.lastMessageId = msg.messageId;
                }
            }
        } catch (error) {
            console.error('Poll error:', error);
        }
    }

    private applyMessage(msg: PollMessagePayload): void {
        const { type, data } = msg;
        if (type === 'chat') {
            this.chatManager!.addMessage(data as Parameters<ChatManager['addMessage']>[0]);
        } else if (type === 'click') {
            this.gameCanvas!.setClick(
                data.playerId as string,
                data.playerName as string,
                data.color as string,
                data.x as number,
                data.y as number
            );
        } else if (type === 'player_join') {
            this.players[data.playerId as string] = {
                id: data.playerId as string,
                name: data.playerName as string,
                color: data.color as string,
                isHost: (data.isHost as boolean) ?? false,
                isConnected: true,
            };
            this.ui.updatePlayerList(this.players, this.currentPlayer?.id);
            this.chatManager!.addSystemMessage(`${data.playerName as string} joined the game`);
        } else if (type === 'player_leave') {
            if (this.players[data.playerId as string]) {
                this.players[data.playerId as string].isConnected = false;
            }
            this.ui.updatePlayerList(this.players, this.currentPlayer?.id);
            this.chatManager!.addSystemMessage(
                `${(data.playerName as string) || 'A player'} left`
            );
        } else if (type === 'host_changed') {
            const newHostId = data.newHostId as string;
            for (const player of Object.values(this.players)) {
                player.isHost = player.id === newHostId;
            }
            this.ui.updatePlayerList(this.players, this.currentPlayer?.id);
            if (this.currentPlayer && newHostId === this.currentPlayer.id) {
                this.currentPlayer.isHost = true;
                this.ui.setPlayerInfo(this.currentPlayer.name, true);
                this.ui.showToast('You are now the host!', 'info');
            }
            this.chatManager!.addSystemMessage('Host has changed');
        }
    }

    private loadGameState(state: GameStatePayload): void {
        this.players = {};
        for (const player of Object.values(state.players)) {
            this.players[player.id] = player;
        }
        this.ui.updatePlayerList(this.players, this.currentPlayer?.id);
        this.gameCanvas!.loadClicks(state.clicks);
        this.chatManager!.loadHistory(state.chatHistory as Parameters<ChatManager['loadHistory']>[0]);
    }

    private async leaveLobby(): Promise<void> {
        if (!this.currentLobby || !this.currentPlayer) return;
        try {
            if (this.pollIntervalId) {
                clearInterval(this.pollIntervalId);
                this.pollIntervalId = null;
            }
            await this.lobbyClient.leaveLobby(this.currentLobby.id, this.currentPlayer.id);
        } catch (error) {
            console.error('Error leaving lobby:', error);
        }
        this.currentLobby = null;
        this.currentPlayer = null;
        this.currentAccount = null;
        this.players = {};
        this.gameCanvas!.clear();
        this.chatManager!.clear();
        this.ui.setConnectionStatus('disconnected');
        this.ui.showScreen('lobby-screen');
        await this.loadLobbies();
        this.ui.showToast('Left the lobby', 'info');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    (window as Window & { app?: GameApp }).app = new GameApp();
});
