/**
 * Main Application
 * Ties all components together
 */
class GameApp {
    constructor() {
        // Configuration
        this.wsUrl = `ws://${window.location.hostname}:8080`;
        
        // State
        this.currentLobby = null;
        this.currentPlayer = null;
        this.players = {};
        
        // Components
        this.ui = new UI();
        this.lobbyClient = new LobbyClient();
        this.wsClient = null;
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
        this.checkForStoredSession();
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

        // Chat send handler
        this.chatManager.on('send', (message) => {
            if (this.wsClient && this.wsClient.isConnected) {
                this.wsClient.send(Messages.chat(message));
            }
        });

        // Click handler
        this.gameCanvas.on('click', ({ x, y }) => {
            if (this.wsClient && this.wsClient.isConnected) {
                this.wsClient.send(Messages.click(x, y));
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
     * Check for stored session and attempt rejoin
     */
    checkForStoredSession() {
        const session = WebSocketClient.getStoredSession();
        
        if (session) {
            this.ui.showToast('Attempting to reconnect to previous session...', 'info');
            this.reconnectToSession(session);
        }
    }

    /**
     * Reconnect to a stored session
     */
    async reconnectToSession(session) {
        try {
            this.wsClient = new WebSocketClient(this.wsUrl);
            this.setupWebSocketHandlers();
            
            await this.wsClient.connect(session.lobbyId, session.playerId, session.token);
            
        } catch (error) {
            console.error('Failed to reconnect:', error);
            WebSocketClient.clearStoredSession();
            this.ui.showToast('Could not reconnect to previous session', 'error');
        }
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

        try {
            this.ui.setButtonEnabled('create-lobby-btn', false);
            
            const result = await this.lobbyClient.createLobby(lobbyName, playerName);
            
            this.currentLobby = result.lobby;
            this.currentPlayer = result.player;
            
            await this.connectToLobby();
            
        } catch (error) {
            console.error('Failed to create lobby:', error);
            this.ui.showToast('Failed to create lobby: ' + error.message, 'error');
        } finally {
            this.ui.setButtonEnabled('create-lobby-btn', true);
        }
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
            
            await this.connectToLobby();
            
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
     * Connect to WebSocket after joining a lobby
     */
    async connectToLobby() {
        try {
            this.ui.setConnectionStatus('connecting');
            
            this.wsClient = new WebSocketClient(this.wsUrl);
            this.setupWebSocketHandlers();
            
            await this.wsClient.connect(
                this.currentLobby.id,
                this.currentPlayer.id,
                this.currentPlayer.reconnectToken
            );
            
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.ui.showToast('Failed to connect to game server', 'error');
            this.ui.setConnectionStatus('disconnected');
        }
    }

    /**
     * Set up WebSocket event handlers
     */
    setupWebSocketHandlers() {
        // Connection established
        this.wsClient.on('connected', (data) => {
            this.handleConnected(data);
        });

        // Reconnected
        this.wsClient.on('reconnected', (data) => {
            this.handleReconnected(data);
        });

        // Disconnected
        this.wsClient.on('disconnected', () => {
            this.ui.setConnectionStatus('disconnected');
            this.chatManager.addSystemMessage('Disconnected from server');
        });

        // Reconnecting
        this.wsClient.on('reconnecting', ({ attempt }) => {
            this.ui.setConnectionStatus('connecting');
            this.chatManager.addSystemMessage(`Reconnecting (attempt ${attempt})...`);
        });

        // Reconnect failed
        this.wsClient.on('reconnect_failed', () => {
            this.ui.showToast('Failed to reconnect. Please refresh the page.', 'error');
        });

        // Server error
        this.wsClient.on('server_error', (data) => {
            this.ui.showToast(data.message, 'error');
        });

        // Message handlers
        this.wsClient.on(`message:${MessageType.CHAT}`, (msg) => {
            this.chatManager.addMessage(msg.data);
        });

        this.wsClient.on(`message:${MessageType.CLICK}`, (msg) => {
            this.gameCanvas.setClick(
                msg.data.playerId,
                msg.data.playerName,
                msg.data.color,
                msg.data.x,
                msg.data.y
            );
        });

        this.wsClient.on(`message:${MessageType.PLAYER_JOIN}`, (msg) => {
            const { playerId, playerName, color, isHost } = msg.data;
            
            this.players[playerId] = {
                id: playerId,
                name: playerName,
                color,
                isHost,
                isConnected: true,
            };
            
            this.ui.updatePlayerList(this.players, this.currentPlayer?.id);
            this.chatManager.addSystemMessage(`${playerName} joined the game`);
        });

        this.wsClient.on(`message:${MessageType.PLAYER_LEAVE}`, (msg) => {
            const { playerId, playerName } = msg.data;
            
            if (this.players[playerId]) {
                this.players[playerId].isConnected = false;
            }
            
            this.ui.updatePlayerList(this.players, this.currentPlayer?.id);
            this.chatManager.addSystemMessage(`${playerName || 'A player'} disconnected`);
        });

        this.wsClient.on(`message:${MessageType.PLAYER_REJOIN}`, (msg) => {
            const { playerId, playerName } = msg.data;
            
            if (this.players[playerId]) {
                this.players[playerId].isConnected = true;
            }
            
            this.ui.updatePlayerList(this.players, this.currentPlayer?.id);
            this.chatManager.addSystemMessage(`${playerName} reconnected`);
        });

        this.wsClient.on(`message:${MessageType.HOST_CHANGED}`, (msg) => {
            const { newHostId } = msg.data;
            
            // Update host status
            for (const player of Object.values(this.players)) {
                player.isHost = player.id === newHostId;
            }
            
            this.ui.updatePlayerList(this.players, this.currentPlayer?.id);
            
            // Update own host status
            if (this.currentPlayer && newHostId === this.currentPlayer.id) {
                this.currentPlayer.isHost = true;
                this.ui.setPlayerInfo(this.currentPlayer.name, true);
                this.ui.showToast('You are now the host!', 'info');
            }
            
            this.chatManager.addSystemMessage('Host has changed');
        });

        this.wsClient.on(`message:${MessageType.STATE_RESPONSE}`, (msg) => {
            // Handle full state sync (typically after rejoin)
            this.loadGameState(msg.data);
        });
    }

    /**
     * Handle successful connection
     */
    handleConnected(data) {
        this.currentLobby = data.lobby;
        this.currentPlayer = data.player;
        
        // Store reconnect token
        this.wsClient.setReconnectToken(data.player.reconnectToken);
        
        // Load initial game state
        this.loadGameState(data.gameState);
        
        // Update UI
        this.ui.setConnectionStatus('connected');
        this.ui.showScreen('game-screen');
        this.ui.setLobbyInfo(this.currentLobby.name, this.currentLobby.id);
        this.ui.setPlayerInfo(this.currentPlayer.name, this.currentPlayer.isHost);
        
        this.chatManager.setEnabled(true);
        this.chatManager.addSystemMessage('Connected to game');
        
        this.ui.showToast('Connected to lobby!', 'success');
    }

    /**
     * Handle successful reconnection
     */
    handleReconnected(data) {
        this.currentLobby = data.lobby;
        this.currentPlayer = data.player;
        
        // Load full game state
        this.loadGameState(data.gameState);
        
        // Update UI
        this.ui.setConnectionStatus('connected');
        this.ui.showScreen('game-screen');
        this.ui.setLobbyInfo(this.currentLobby.name, this.currentLobby.id);
        this.ui.setPlayerInfo(this.currentPlayer.name, this.currentPlayer.isHost);
        
        this.chatManager.setEnabled(true);
        this.chatManager.addSystemMessage('Reconnected to game');
        
        this.ui.showToast('Reconnected!', 'success');
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
            // Disconnect WebSocket
            if (this.wsClient) {
                this.wsClient.disconnect();
                this.wsClient = null;
            }

            // Clear stored session
            WebSocketClient.clearStoredSession();

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
