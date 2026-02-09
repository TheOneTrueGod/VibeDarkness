/**
 * Main Application
 * Ties all components together
 */
class GameApp {
    constructor() {
        // State
        this.currentLobby = null;
        this.currentPlayer = null;
        this.players = {};
        this.lastMessageId = null;
        this.pollIntervalId = null;

        // Components
        this.ui = new UI();
        this.lobbyClient = new LobbyClient();
        this.chatManager = null;
        this.gameCanvas = null;

        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        this.setupUIComponents();
        this.setupEventListeners();
        await this.loadLobbies();
    }

    /**
     * Set up UI components
     */
    setupUIComponents() {
        // Chat manager
        this.chatManager = new ChatManager(
            document.getElementById('chat-messages'),
            document.getElementById('chat-input'),
            document.getElementById('send-chat-btn')
        );

        // Game canvas
        this.gameCanvas = new GameCanvas(
            document.getElementById('game-canvas-container'),
            document.getElementById('click-markers')
        );

        // Chat send handler (HTTP POST)
        this.chatManager.on('send', (message) => {
            if (this.currentLobby && this.currentPlayer) {
                this.lobbyClient.sendMessage(this.currentLobby.id, this.currentPlayer.id, 'chat', { message })
                    .catch(err => this.ui.showToast('Failed to send: ' + err.message, 'error'));
            }
        });

        // Click handler (HTTP POST)
        this.gameCanvas.on('click', ({ x, y }) => {
            if (this.currentLobby && this.currentPlayer) {
                this.lobbyClient.sendMessage(this.currentLobby.id, this.currentPlayer.id, 'click', { x, y })
                    .catch(() => {});
            }
        });
    }

    /**
     * Set up DOM event listeners
     */
    setupEventListeners() {
        // Create lobby button
        document.getElementById('create-lobby-btn').addEventListener('click', () => {
            this.createLobby();
        });

        // Join by code button
        document.getElementById('join-lobby-btn').addEventListener('click', () => {
            this.joinLobbyByCode();
        });

        // Refresh lobbies button
        document.getElementById('refresh-lobbies-btn').addEventListener('click', () => {
            this.loadLobbies();
        });

        // Leave lobby button
        document.getElementById('leave-lobby-btn').addEventListener('click', () => {
            this.leaveLobby();
        });

        // Enter key on lobby code input
        document.getElementById('lobby-code').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinLobbyByCode();
            }
        });

        // Enter key on lobby name input
        document.getElementById('lobby-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.createLobby();
            }
        });
    }

    /**
     * Load available lobbies
     */
    async loadLobbies() {
        try {
            const lobbies = await this.lobbyClient.listLobbies();
            this.ui.renderLobbyList(lobbies, (lobbyId) => this.joinLobby(lobbyId));
        } catch (error) {
            console.error('Failed to load lobbies:', error);
            this.ui.showToast('Failed to load lobbies', 'error');
        }
    }

    /**
     * Create a new lobby
     */
    async createLobby() {
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
            const result = await this.lobbyClient.createLobby(lobbyName, playerName);

            this.currentLobby = result.lobby;
            this.currentPlayer = result.player;

            // Show lobby screen and start polling (no WebSocket)
            this.showLobbyScreenWithConnectingState();
            await this.startInLobby();
        } catch (error) {
            console.error('Failed to create lobby:', error);
            this.ui.showToast('Failed to create lobby: ' + error.message, 'error');
            this.ui.setButtonEnabled('create-lobby-btn', true);
        }
        // Only re-enable button on error; if we showed lobby screen, leave it disabled
    }

    /**
     * Join a lobby by its ID
     */
    async joinLobby(lobbyId) {
        const playerName = this.ui.getInputValue('player-name');

        if (!playerName) {
            this.ui.showToast('Please enter your name', 'warning');
            return;
        }

        try {
            const result = await this.lobbyClient.joinLobby(lobbyId, playerName);

            this.currentLobby = result.lobby;
            this.currentPlayer = result.player;

            // Show lobby screen and start polling (no WebSocket)
            this.showLobbyScreenWithConnectingState();
            await this.startInLobby();
        } catch (error) {
            console.error('Failed to join lobby:', error);
            this.ui.showToast('Failed to join lobby: ' + error.message, 'error');
        }
    }

    /**
     * Join a lobby by code
     */
    async joinLobbyByCode() {
        const lobbyCode = this.ui.getInputValue('lobby-code').toUpperCase();

        if (!lobbyCode) {
            this.ui.showToast('Please enter a lobby code', 'warning');
            return;
        }

        await this.joinLobby(lobbyCode);
    }

    /**
     * Show the lobby/game screen with "Connecting..." before WebSocket is established
     */
    showLobbyScreenWithConnectingState() {
        this.ui.setConnectionStatus('connecting');
        this.ui.showScreen('game-screen');
        this.ui.setLobbyInfo(this.currentLobby.name, this.currentLobby.id);
        this.ui.setPlayerInfo(this.currentPlayer.name, this.currentPlayer.isHost);
        // Show the host in the player list immediately
        const initialPlayers = {
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
        this.chatManager.setEnabled(false);
    }

    /**
     * Load lobby state and start polling for messages (replaces WebSocket flow)
     */
    async startInLobby() {
        try {
            const { gameState, lastMessageId } = await this.lobbyClient.getLobbyState(
                this.currentLobby.id,
                this.currentPlayer.id
            );
            this.loadGameState(gameState);
            this.lastMessageId = lastMessageId ?? null;

            this.ui.setConnectionStatus('connected');
            this.chatManager.setEnabled(true);
            this.chatManager.addSystemMessage('Connected to lobby');

            this.pollIntervalId = setInterval(() => this.pollMessages(), 1000);
        } catch (error) {
            console.error('Failed to load lobby state:', error);
            this.ui.showToast('Failed to load lobby', 'error');
            this.ui.setConnectionStatus('disconnected');
        }
    }

    /**
     * Poll for new messages every second
     */
    async pollMessages() {
        if (!this.currentLobby || !this.currentPlayer) return;
        try {
            const messages = await this.lobbyClient.getMessages(
                this.currentLobby.id,
                this.currentPlayer.id,
                this.lastMessageId
            );
            for (const msg of messages) {
                this.applyMessage(msg);
                if (msg.messageId != null && (this.lastMessageId == null || msg.messageId > this.lastMessageId)) {
                    this.lastMessageId = msg.messageId;
                }
            }
        } catch (error) {
            console.error('Poll error:', error);
        }
    }

    /**
     * Apply a single message from the server to local state and UI
     */
    applyMessage(msg) {
        const { type, data } = msg;
        if (type === 'chat') {
            this.chatManager.addMessage(data);
        } else if (type === 'click') {
            this.gameCanvas.setClick(data.playerId, data.playerName, data.color, data.x, data.y);
        } else if (type === 'player_join') {
            this.players[data.playerId] = {
                id: data.playerId,
                name: data.playerName,
                color: data.color,
                isHost: data.isHost ?? false,
                isConnected: true,
            };
            this.ui.updatePlayerList(this.players, this.currentPlayer?.id);
            this.chatManager.addSystemMessage(`${data.playerName} joined the game`);
        } else if (type === 'player_leave') {
            if (this.players[data.playerId]) {
                this.players[data.playerId].isConnected = false;
            }
            this.ui.updatePlayerList(this.players, this.currentPlayer?.id);
            this.chatManager.addSystemMessage(`${data.playerName || 'A player'} left`);
        } else if (type === 'host_changed') {
            const newHostId = data.newHostId;
            for (const player of Object.values(this.players)) {
                player.isHost = player.id === newHostId;
            }
            this.ui.updatePlayerList(this.players, this.currentPlayer?.id);
            if (this.currentPlayer && newHostId === this.currentPlayer.id) {
                this.currentPlayer.isHost = true;
                this.ui.setPlayerInfo(this.currentPlayer.name, true);
                this.ui.showToast('You are now the host!', 'info');
            }
            this.chatManager.addSystemMessage('Host has changed');
        }
    }

    /**
     * Load game state
     */
    loadGameState(state) {
        // Load players
        this.players = {};
        for (const player of Object.values(state.players)) {
            this.players[player.id] = player;
        }
        this.ui.updatePlayerList(this.players, this.currentPlayer?.id);

        // Load clicks
        this.gameCanvas.loadClicks(state.clicks);

        // Load chat history
        this.chatManager.loadHistory(state.chatHistory);
    }

    /**
     * Leave the current lobby
     */
    async leaveLobby() {
        if (!this.currentLobby || !this.currentPlayer) return;

        try {
            if (this.pollIntervalId) {
                clearInterval(this.pollIntervalId);
                this.pollIntervalId = null;
            }

            // Notify server
            await this.lobbyClient.leaveLobby(
                this.currentLobby.id,
                this.currentPlayer.id
            );

        } catch (error) {
            console.error('Error leaving lobby:', error);
        }

        // Reset state
        this.currentLobby = null;
        this.currentPlayer = null;
        this.players = {};

        // Reset UI
        this.gameCanvas.clear();
        this.chatManager.clear();
        this.ui.setConnectionStatus('disconnected');
        this.ui.showScreen('lobby-screen');

        // Refresh lobby list
        await this.loadLobbies();

        this.ui.showToast('Left the lobby', 'info');
    }
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new GameApp();
});
