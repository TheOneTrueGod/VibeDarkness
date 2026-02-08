/**
 * UI Manager
 * Handles screen transitions, player lists, and toast notifications
 */
class UI {
    constructor() {
        this.currentScreen = 'lobby-screen';
        this.toastContainer = document.getElementById('toast-container');
    }

    /**
     * Show a screen
     */
    showScreen(screenId) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Show target screen
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenId;
        }
    }

    /**
     * Show toast notification
     */
    showToast(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        this.toastContainer.appendChild(toast);

        // Remove after duration
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    /**
     * Update connection status indicator
     */
    setConnectionStatus(status) {
        const statusEl = document.getElementById('connection-status');
        statusEl.className = `status ${status}`;
        statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
    }

    /**
     * Update player list
     */
    updatePlayerList(players, currentPlayerId) {
        const listEl = document.getElementById('player-list');
        listEl.innerHTML = '';

        for (const player of Object.values(players)) {
            const li = document.createElement('li');
            li.className = player.isConnected ? '' : 'disconnected';
            
            let html = `<span class="player-dot" style="background-color: ${player.color}"></span>`;
            html += `<span>${this.escapeHtml(player.name)}</span>`;
            
            if (player.isHost) {
                html += `<span class="host-indicator">HOST</span>`;
            }
            
            if (player.id === currentPlayerId) {
                html += ` (You)`;
            }
            
            li.innerHTML = html;
            listEl.appendChild(li);
        }
    }

    /**
     * Update lobby info in game header
     */
    setLobbyInfo(lobbyName, lobbyCode) {
        document.getElementById('game-lobby-name').textContent = lobbyName;
        document.getElementById('game-lobby-code').textContent = lobbyCode;
    }

    /**
     * Update player info in game header
     */
    setPlayerInfo(playerName, isHost) {
        document.getElementById('game-player-name').textContent = playerName;
        
        const hostBadge = document.getElementById('host-badge');
        if (isHost) {
            hostBadge.classList.remove('hidden');
        } else {
            hostBadge.classList.add('hidden');
        }
    }

    /**
     * Render lobby list
     */
    renderLobbyList(lobbies, onJoinClick) {
        const listEl = document.getElementById('lobby-list');
        
        if (lobbies.length === 0) {
            listEl.innerHTML = '<p class="empty-message">No public lobbies available</p>';
            return;
        }

        listEl.innerHTML = '';

        for (const lobby of lobbies) {
            const div = document.createElement('div');
            div.className = 'lobby-item';
            
            div.innerHTML = `
                <div class="lobby-item-info">
                    <span class="lobby-item-name">${this.escapeHtml(lobby.name)}</span>
                    <span class="lobby-item-players">${lobby.playerCount}/${lobby.maxPlayers} players</span>
                </div>
            `;
            
            const joinBtn = document.createElement('button');
            joinBtn.className = 'btn btn-primary btn-small';
            joinBtn.textContent = 'Join';
            joinBtn.disabled = lobby.playerCount >= lobby.maxPlayers;
            joinBtn.addEventListener('click', () => onJoinClick(lobby.id));
            
            div.appendChild(joinBtn);
            listEl.appendChild(div);
        }
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Get input value
     */
    getInputValue(id) {
        const input = document.getElementById(id);
        return input ? input.value.trim() : '';
    }

    /**
     * Clear input value
     */
    clearInput(id) {
        const input = document.getElementById(id);
        if (input) {
            input.value = '';
        }
    }

    /**
     * Enable/disable button
     */
    setButtonEnabled(id, enabled) {
        const btn = document.getElementById(id);
        if (btn) {
            btn.disabled = !enabled;
        }
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UI;
}
