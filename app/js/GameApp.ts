/**
 * Game Application
 * Ties all components together: UI, lobby client, chat, canvas, and poll message handling
 */

import { ChatManager } from './ChatManager.js';
import { GameCanvas } from './GameCanvas.js';
import { handlePollMessage } from './MessageHandler.js';
import type { PollMessageHandlerContext } from './MessageHandler.js';
import { LobbyClient } from './LobbyClient.js';
import { Messages } from './MessageTypes.js';
import { UI } from './UI.js';
import type { AccountState, GameStatePayload, LobbyState, PlayerState, PollMessagePayload } from './types.js';
import { GAMES, getGameById } from './games/list.js';
import { updateDebugGameState } from './DebugConsole.js';

/** Lobby page state: 'home' (game list) or 'in_game' (game loaded) */
type LobbyPageState = 'home' | 'in_game';

export class GameApp {
    private currentLobby: LobbyState | null = null;
    private currentPlayer: PlayerState | null = null;
    private currentAccount: AccountState | null = null;
    private players: Record<string, PlayerState> = {};
    private lastMessageId: number | null = null;
    private pollIntervalId: ReturnType<typeof setInterval> | null = null;
    private lobbyStatusIntervalId: ReturnType<typeof setInterval> | null = null;

    /** Lobby page state and selected game (from server) */
    private lobbyPageState: LobbyPageState = 'home';
    /** Unique game instance id (from server) */
    private lobbyGameId: string | null = null;
    /** Game type id for loading the game module (e.g. minion_battles) */
    private lobbyGameType: string | null = null;
    /** Game-specific state from server (when in game) */
    private lobbyGameData: Record<string, unknown> | null = null;
    private currentGameInstance: { destroy?: () => void } | null = null;

    private ui: UI;
    private lobbyClient: LobbyClient;
    private chatManager: ChatManager | null = null;
    private gameCanvas: GameCanvas | null = null;

    constructor() {
        this.ui = new UI();
        this.lobbyClient = new LobbyClient();
        this.init();
    }

    private static readonly PLAYER_NAME_STORAGE_KEY = 'playerName';
    private static readonly LOBBY_PATH_PREFIX = '/lobby/';

    private async init(): Promise<void> {
        this.setupUIComponents();
        this.setupEventListeners();

        const lobbyCode = this.getLobbyCodeFromPath();
        if (lobbyCode) {
            const storedName = this.getStoredPlayerName();
            if (storedName) {
                await this.rejoinLobbyFromPath(lobbyCode, storedName);
                return;
            }
            window.location.href = '/';
            return;
        }

        this.restorePlayerName();
        await this.loadLobbies();
    }

    private getLobbyCodeFromPath(): string | null {
        const match = window.location.pathname.match(/^\/lobby\/([A-Za-z0-9]+)$/);
        return match ? match[1].toUpperCase() : null;
    }

    private getStoredPlayerName(): string | null {
        try {
            const name = localStorage.getItem(GameApp.PLAYER_NAME_STORAGE_KEY);
            return name && name.trim() ? name.trim() : null;
        } catch {
            return null;
        }
    }

    private async rejoinLobbyFromPath(lobbyCode: string, playerName: string): Promise<void> {
        this.ui.setInputValue('player-name', playerName);
        try {
            const account = await this.lobbyClient.signIn(playerName);
            this.savePlayerName(playerName);
            this.currentAccount = account;
            const result = await this.lobbyClient.joinLobby(lobbyCode, account.id);
            this.currentLobby = result.lobby;
            this.currentPlayer = result.player;
            this.showLobbyScreenWithConnectingState();
            await this.startInLobby();
        } catch (error) {
            console.error('Failed to rejoin lobby:', error);
            this.ui.showToast(
                'Failed to rejoin lobby: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'error'
            );
            window.location.href = '/';
        }
    }

    private updateLobbyUrl(lobbyCode?: string): void {
        const url = lobbyCode ? `${GameApp.LOBBY_PATH_PREFIX}${lobbyCode}` : '/';
        if (lobbyCode) {
            window.history.pushState(null, '', url);
        } else {
            window.history.replaceState(null, '', url);
        }
    }

    private restorePlayerName(): void {
        try {
            const stored = localStorage.getItem(GameApp.PLAYER_NAME_STORAGE_KEY);
            if (stored) this.ui.setInputValue('player-name', stored);
        } catch {
            // ignore localStorage errors (e.g. private browsing)
        }
    }

    private savePlayerName(name: string): void {
        const trimmed = name.trim();
        if (!trimmed) return;
        try {
            localStorage.setItem(GameApp.PLAYER_NAME_STORAGE_KEY, trimmed);
        } catch {
            // ignore localStorage errors
        }
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
                const msg = Messages.chat(message as string);
                this.lobbyClient
                    .sendMessage(this.currentLobby.id, this.currentPlayer.id, msg.type, msg.data)
                    .catch((err: Error) =>
                        this.ui.showToast('Failed to send: ' + err.message, 'error')
                    );
            }
        });

        this.gameCanvas.on('click', (payload: unknown) => {
            const { x, y } = payload as { x: number; y: number };
            if (this.currentLobby && this.currentPlayer) {
                const msg = Messages.click(x, y);
                this.lobbyClient
                    .sendMessage(this.currentLobby.id, this.currentPlayer.id, msg.type, msg.data)
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

        window.addEventListener('popstate', () => {
            if (this.currentLobby && window.location.pathname === '/') {
                this.leaveLobby();
            }
        });

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
            this.savePlayerName(playerName);
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
            this.savePlayerName(playerName);
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
        this.updateLobbyUrl(this.currentLobby.id);
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
            this.startLobbyStatusPoll();
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
            const context = this.getPollMessageContext();
            for (const msg of messages) {
                handlePollMessage(msg as PollMessagePayload, context);
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

    private getPollMessageContext(): PollMessageHandlerContext {
        return {
            players: this.players,
            currentPlayer: this.currentPlayer,
            updatePlayerList: (players, currentPlayerId) => {
                this.ui.updatePlayerList(players, currentPlayerId);
            },
            addMessage: (data) => {
                this.chatManager!.addMessage(data);
            },
            addSystemMessage: (message) => {
                this.chatManager!.addSystemMessage(message);
            },
            setClick: (playerId, playerName, color, x, y) => {
                this.gameCanvas!.setClick(playerId, playerName, color, x, y);
            },
            setPlayerInfo: (name, isHost) => {
                this.ui.setPlayerInfo(name, isHost);
            },
            showToast: (message, type) => {
                this.ui.showToast(message, type);
            },
        };
    }

    private loadGameState(state: GameStatePayload): void {
        this.lobbyPageState = (state.lobbyState === 'in_game' ? 'in_game' : 'home') as LobbyPageState;
        this.lobbyGameId = state.gameId ?? null;
        this.lobbyGameType = state.gameType ?? null;
        this.lobbyGameData = state.game ?? null;
        this.players = {};
        for (const player of Object.values(state.players)) {
            this.players[player.id] = player;
        }
        this.ui.updatePlayerList(this.players, this.currentPlayer?.id);
        this.gameCanvas!.loadClicks(state.clicks);
        this.chatManager!.loadHistory(state.chatHistory as Parameters<ChatManager['loadHistory']>[0]);
        updateDebugGameState(state);
        this.updateLobbyCentralView();
    }

    private startLobbyStatusPoll(): void {
        this.stopLobbyStatusPoll();
        this.lobbyStatusIntervalId = setInterval(() => this.fetchLobbyStatus(), 5000);
    }

    private stopLobbyStatusPoll(): void {
        if (this.lobbyStatusIntervalId) {
            clearInterval(this.lobbyStatusIntervalId);
            this.lobbyStatusIntervalId = null;
        }
    }

    private async fetchLobbyStatus(): Promise<void> {
        if (!this.currentLobby || !this.currentPlayer) return;
        try {
            const { gameState } = await this.lobbyClient.getLobbyState(
                this.currentLobby.id,
                this.currentPlayer.id
            );
            const payload = gameState as GameStatePayload;
            updateDebugGameState(payload);
            const newState = (payload.lobbyState === 'in_game' ? 'in_game' : 'home') as LobbyPageState;
            const newGameId = payload.gameId ?? null;
            const newGameType = payload.gameType ?? null;
            const newGameData = payload.game ?? null;
            if (
                newState !== this.lobbyPageState ||
                newGameId !== this.lobbyGameId ||
                newGameType !== this.lobbyGameType
            ) {
                this.lobbyPageState = newState;
                this.lobbyGameId = newGameId;
                this.lobbyGameType = newGameType;
                this.lobbyGameData = newGameData;
                this.updateLobbyCentralView();
            }
        } catch {
            // ignore; keep current view
        }
    }

    private updateLobbyCentralView(): void {
        const listEl = document.getElementById('game-list-container');
        const slotEl = document.getElementById('game-slot');
        const canvasEl = document.getElementById('game-canvas-container');
        if (!listEl || !slotEl || !canvasEl) return;

        listEl.classList.add('hidden');
        slotEl.classList.add('hidden');
        canvasEl.classList.add('hidden');

        if (this.lobbyPageState === 'home') {
            listEl.classList.remove('hidden');
            this.renderGameList(listEl);
            this.destroyCurrentGame();
        } else {
            slotEl.classList.remove('hidden');
            if (this.lobbyGameType) {
                this.loadGameIntoSlot(slotEl, this.lobbyGameType, this.lobbyGameId, this.lobbyGameData);
            }
        }
    }

    private renderGameList(container: HTMLElement): void {
        const isHost = this.currentPlayer?.isHost ?? false;
        container.innerHTML = `
            <ul class="game-list">
                ${GAMES.map(
                    (game) => `
                    <li class="game-list-card ${game.enabled ? '' : 'disabled'}" data-game-id="${game.id}">
                        ${game.image ? `<img src="${game.image}" alt="">` : '<div style="width:100%;aspect-ratio:16/10;background:var(--surface-color);border-radius:4px;"></div>'}
                        <h3>${this.escapeHtml(game.title)}</h3>
                        <p>${this.escapeHtml(game.description)}</p>
                    </li>
                `
                ).join('')}
            </ul>
        `;
        container.querySelectorAll('.game-list-card').forEach((el) => {
            const card = el as HTMLElement;
            const gameId = card.dataset.gameId!;
            const game = getGameById(gameId);
            if (!game?.enabled || !isHost) return;
            card.addEventListener('click', () => this.onHostSelectGame(gameId));
        });
    }

    private escapeHtml(s: string): string {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    private async onHostSelectGame(gameTypeId: string): Promise<void> {
        if (!this.currentLobby || !this.currentPlayer?.isHost) return;
        const game = getGameById(gameTypeId);
        if (!game?.enabled) return;
        try {
            await this.lobbyClient.setLobbyState(
                this.currentLobby.id,
                this.currentPlayer.id,
                'in_game',
                gameTypeId
            );
            this.lobbyPageState = 'in_game';
            this.lobbyGameType = gameTypeId;
            this.lobbyGameId = null;
            this.lobbyGameData = null;
            const { gameState } = await this.lobbyClient.getLobbyState(
                this.currentLobby.id,
                this.currentPlayer.id
            );
            const payload = gameState as GameStatePayload;
            this.lobbyGameId = payload.gameId ?? null;
            this.lobbyGameData = payload.game ?? null;
            updateDebugGameState(payload);
            this.updateLobbyCentralView();
        } catch (error) {
            this.ui.showToast(
                'Failed to start game: ' + (error instanceof Error ? error.message : 'Unknown error'),
                'error'
            );
        }
    }

    private destroyCurrentGame(): void {
        if (this.currentGameInstance?.destroy) {
            this.currentGameInstance.destroy();
        }
        this.currentGameInstance = null;
    }

    private async loadGameIntoSlot(
        container: HTMLElement,
        gameTypeId: string,
        gameId: string | null = null,
        gameData: Record<string, unknown> | null = null
    ): Promise<void> {
        const game = getGameById(gameTypeId);
        if (!game) return;
        this.destroyCurrentGame();
        container.innerHTML = '';
        try {
            const mod = await import(`./games/${gameTypeId}/game.js`);
            const GameClass = mod.default;
            if (typeof GameClass === 'function') {
                const options = { gameId, gameType: gameTypeId, gameData: gameData ?? undefined };
                this.currentGameInstance = new GameClass(container, options) as { destroy?: () => void };
            }
        } catch (error) {
            console.error('Failed to load game:', error);
            container.innerHTML = `<p class="game-load-error">Failed to load game: ${this.escapeHtml(game.title)}</p>`;
        }
    }

    private async leaveLobby(): Promise<void> {
        if (!this.currentLobby || !this.currentPlayer) return;
        try {
            if (this.pollIntervalId) {
                clearInterval(this.pollIntervalId);
                this.pollIntervalId = null;
            }
            this.stopLobbyStatusPoll();
            this.destroyCurrentGame();
            await this.lobbyClient.leaveLobby(this.currentLobby.id, this.currentPlayer.id);
        } catch (error) {
            console.error('Error leaving lobby:', error);
        }
        this.currentLobby = null;
        this.currentPlayer = null;
        this.currentAccount = null;
        this.players = {};
        this.lobbyPageState = 'home';
        this.lobbyGameId = null;
        this.lobbyGameType = null;
        this.lobbyGameData = null;
        this.gameCanvas!.clear();
        this.chatManager!.clear();
        this.ui.setConnectionStatus('disconnected');
        this.updateLobbyUrl();
        this.ui.showScreen('lobby-screen');
        await this.loadLobbies();
        this.ui.showToast('Left the lobby', 'info');
    }
}
