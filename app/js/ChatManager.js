/**
 * Chat Manager
 * Handles chat UI and message display
 */
class ChatManager extends EventEmitter {
    constructor(containerElement, inputElement, sendButton) {
        super();
        this.container = containerElement;
        this.input = inputElement;
        this.sendButton = sendButton;
        this.messages = [];
        this.maxMessages = 100;

        this.setupEventListeners();
    }

    /**
     * Set up DOM event listeners
     */
    setupEventListeners() {
        // Send on button click
        this.sendButton.addEventListener('click', () => this.sendMessage());

        // Send on Enter key
        this.input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    /**
     * Send a chat message
     */
    sendMessage() {
        const message = this.input.value.trim();
        
        if (!message) return;

        this.emit('send', message);
        this.input.value = '';
        this.input.focus();
    }

    /**
     * Add a chat message to the display
     */
    addMessage(data) {
        const { playerId, playerName, playerColor, message, timestamp } = data;
        
        const entry = {
            playerId,
            playerName,
            playerColor,
            message,
            timestamp,
        };
        
        this.messages.push(entry);
        
        // Trim old messages
        if (this.messages.length > this.maxMessages) {
            this.messages.shift();
            this.container.removeChild(this.container.firstChild);
        }

        this.renderMessage(entry);
        this.scrollToBottom();
    }

    /**
     * Add a system message
     */
    addSystemMessage(message) {
        const entry = {
            system: true,
            message,
            timestamp: Date.now() / 1000,
        };
        
        this.messages.push(entry);
        this.renderSystemMessage(entry);
        this.scrollToBottom();
    }

    /**
     * Render a chat message
     */
    renderMessage(entry) {
        const div = document.createElement('div');
        div.className = 'chat-message';
        div.style.borderLeftColor = entry.playerColor;

        const time = this.formatTime(entry.timestamp);

        div.innerHTML = `
            <div class="sender" style="color: ${entry.playerColor}">${this.escapeHtml(entry.playerName)}</div>
            <div class="content">${this.escapeHtml(entry.message)}</div>
            <div class="timestamp">${time}</div>
        `;

        this.container.appendChild(div);
    }

    /**
     * Render a system message
     */
    renderSystemMessage(entry) {
        const div = document.createElement('div');
        div.className = 'chat-message system';

        div.innerHTML = `
            <div class="content">${this.escapeHtml(entry.message)}</div>
        `;

        this.container.appendChild(div);
    }

    /**
     * Load chat history
     */
    loadHistory(history) {
        this.clear();
        
        for (const entry of history) {
            if (entry.system) {
                this.renderSystemMessage(entry);
            } else {
                this.renderMessage({
                    playerId: entry.playerId,
                    playerName: entry.playerName,
                    playerColor: entry.playerColor,
                    message: entry.message,
                    timestamp: entry.timestamp,
                });
            }
        }
        
        this.messages = [...history];
        this.scrollToBottom();
    }

    /**
     * Clear all messages
     */
    clear() {
        this.container.innerHTML = '';
        this.messages = [];
    }

    /**
     * Scroll to the bottom of the chat
     */
    scrollToBottom() {
        this.container.scrollTop = this.container.scrollHeight;
    }

    /**
     * Format timestamp
     */
    formatTime(timestamp) {
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Enable/disable input
     */
    setEnabled(enabled) {
        this.input.disabled = !enabled;
        this.sendButton.disabled = !enabled;
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatManager;
}
