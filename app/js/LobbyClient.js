/**
 * Lobby Client
 * Handles HTTP API calls for lobby management
 */
class LobbyClient {
    constructor(baseUrl = '') {
        this.baseUrl = baseUrl;
    }

    /**
     * Make an API request
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
            },
        };

        const response = await fetch(url, { ...defaultOptions, ...options });
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    }

    /**
     * List all public lobbies
     */
    async listLobbies() {
        const data = await this.request('/api/lobbies');
        return data.lobbies;
    }

    /**
     * Create a new lobby
     */
    async createLobby(lobbyName, playerName, maxPlayers = 8, isPublic = true) {
        const data = await this.request('/api/lobbies', {
            method: 'POST',
            body: JSON.stringify({
                name: lobbyName,
                playerName,
                maxPlayers,
                isPublic,
            }),
        });
        
        return {
            lobby: data.lobby,
            player: data.player,
        };
    }

    /**
     * Get lobby details
     */
    async getLobby(lobbyId) {
        const data = await this.request(`/api/lobbies/${lobbyId}`);
        return data.lobby;
    }

    /**
     * Join an existing lobby
     */
    async joinLobby(lobbyId, playerName) {
        const data = await this.request(`/api/lobbies/${lobbyId}/join`, {
            method: 'POST',
            body: JSON.stringify({ playerName }),
        });
        
        return {
            lobby: data.lobby,
            player: data.player,
            isRejoin: data.isRejoin,
        };
    }

    /**
     * Leave a lobby
     */
    async leaveLobby(lobbyId, playerId) {
        await this.request(`/api/lobbies/${lobbyId}/leave`, {
            method: 'POST',
            body: JSON.stringify({ playerId }),
        });
    }

    /**
     * Get lobby state (players, clicks, chat) and lastMessageId for initial load
     */
    async getLobbyState(lobbyId, playerId) {
        const data = await this.request(`/api/lobbies/${lobbyId}/state?playerId=${encodeURIComponent(playerId)}`);
        return { gameState: data.gameState, lastMessageId: data.lastMessageId };
    }

    /**
     * Get recent messages (for polling). If afterMessageId is null, returns last 10; otherwise up to 10 after that id.
     */
    async getMessages(lobbyId, playerId, afterMessageId = null) {
        const params = new URLSearchParams({ playerId });
        if (afterMessageId != null) {
            params.set('after', String(afterMessageId));
        }
        const data = await this.request(`/api/lobbies/${lobbyId}/messages?${params}`);
        return data.messages;
    }

    /**
     * Send a message (chat or click)
     */
    async sendMessage(lobbyId, playerId, type, data) {
        const res = await this.request(`/api/lobbies/${lobbyId}/messages`, {
            method: 'POST',
            body: JSON.stringify({ playerId, type, data }),
        });
        return res.messageId;
    }

    /**
     * Get server stats
     */
    async getStats() {
        const data = await this.request('/api/stats');
        return data.stats;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LobbyClient;
}
