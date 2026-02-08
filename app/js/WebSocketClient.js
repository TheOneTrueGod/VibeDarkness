/**
 * WebSocket Client
 * Handles connection, reconnection, and message routing
 */
class WebSocketClient extends EventEmitter {
    constructor(url) {
        super();
        this.url = url;
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.pingInterval = null;
        this.lobbyId = null;
        this.playerId = null;
        this.reconnectToken = null;
    }

    /**
     * Connect to the WebSocket server and join a lobby
     */
    connect(lobbyId, playerId, reconnectToken = null) {
        this.lobbyId = lobbyId;
        this.playerId = playerId;
        this.reconnectToken = reconnectToken;

        return new Promise((resolve, reject) => {
            try {
                this.socket = new WebSocket(this.url);
                
                this.socket.onopen = () => {
                    console.log('WebSocket connected');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.emit('connecting');
                    
                    // Authenticate with the server
                    if (this.reconnectToken) {
                        this.sendRaw({
                            action: 'rejoin',
                            lobbyId: this.lobbyId,
                            reconnectToken: this.reconnectToken,
                        });
                    } else {
                        this.sendRaw({
                            action: 'connect',
                            lobbyId: this.lobbyId,
                            playerId: this.playerId,
                        });
                    }
                    
                    this.startPing();
                };

                this.socket.onmessage = (event) => {
                    this.handleMessage(event.data, resolve, reject);
                };

                this.socket.onclose = (event) => {
                    console.log('WebSocket closed', event.code, event.reason);
                    this.handleDisconnect();
                };

                this.socket.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    this.emit('error', error);
                    reject(error);
                };

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Handle incoming messages
     */
    handleMessage(rawData, resolveConnect, rejectConnect) {
        try {
            const data = JSON.parse(rawData);
            
            // Handle connection responses
            if (data.type === 'connected') {
                this.emit('socket_connected', data.data);
                return;
            }

            if (data.type === 'connected_to_lobby') {
                this.emit('connected', data.data);
                if (resolveConnect) resolveConnect(data.data);
                return;
            }

            if (data.type === 'rejoined_lobby') {
                this.emit('reconnected', data.data);
                if (resolveConnect) resolveConnect(data.data);
                return;
            }

            if (data.type === 'error') {
                this.emit('server_error', data.data);
                if (rejectConnect) rejectConnect(new Error(data.data.message));
                return;
            }

            // Handle game messages
            const message = Message.fromRaw(data);
            this.emit('message', message);
            this.emit(`message:${message.type}`, message);

        } catch (error) {
            console.error('Error parsing message:', error);
        }
    }

    /**
     * Handle disconnection
     */
    handleDisconnect() {
        this.isConnected = false;
        this.stopPing();
        this.emit('disconnected');

        // Attempt reconnection if we have a reconnect token
        if (this.reconnectToken && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.attemptReconnect();
        }
    }

    /**
     * Attempt to reconnect
     */
    attemptReconnect() {
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        this.emit('reconnecting', { attempt: this.reconnectAttempts, delay });

        setTimeout(() => {
            this.connect(this.lobbyId, this.playerId, this.reconnectToken)
                .catch(error => {
                    console.error('Reconnection failed:', error);
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.attemptReconnect();
                    } else {
                        this.emit('reconnect_failed');
                    }
                });
        }, delay);
    }

    /**
     * Send a message
     */
    send(message) {
        if (!this.isConnected || !this.socket) {
            console.warn('Cannot send message: not connected');
            return false;
        }

        if (message instanceof Message) {
            message.validate();
            this.socket.send(message.toJSON());
        } else {
            this.socket.send(JSON.stringify(message));
        }
        
        return true;
    }

    /**
     * Send raw data (for actions like connect/rejoin)
     */
    sendRaw(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(data));
        }
    }

    /**
     * Start ping interval
     */
    startPing() {
        this.stopPing();
        this.pingInterval = setInterval(() => {
            if (this.isConnected) {
                this.send(Messages.ping());
            }
        }, 30000);
    }

    /**
     * Stop ping interval
     */
    stopPing() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    /**
     * Disconnect from the server
     */
    disconnect() {
        this.stopPing();
        this.reconnectToken = null; // Prevent auto-reconnect
        
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        this.isConnected = false;
    }

    /**
     * Set reconnect token for session persistence
     */
    setReconnectToken(token) {
        this.reconnectToken = token;
        // Store in session storage for page refresh recovery
        if (token) {
            sessionStorage.setItem('reconnectToken', token);
            sessionStorage.setItem('lobbyId', this.lobbyId);
            sessionStorage.setItem('playerId', this.playerId);
        } else {
            sessionStorage.removeItem('reconnectToken');
            sessionStorage.removeItem('lobbyId');
            sessionStorage.removeItem('playerId');
        }
    }

    /**
     * Check for stored session
     */
    static getStoredSession() {
        const token = sessionStorage.getItem('reconnectToken');
        const lobbyId = sessionStorage.getItem('lobbyId');
        const playerId = sessionStorage.getItem('playerId');
        
        if (token && lobbyId && playerId) {
            return { token, lobbyId, playerId };
        }
        return null;
    }

    /**
     * Clear stored session
     */
    static clearStoredSession() {
        sessionStorage.removeItem('reconnectToken');
        sessionStorage.removeItem('lobbyId');
        sessionStorage.removeItem('playerId');
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WebSocketClient;
}
