/**
 * UI Manager
 * Handles screen transitions, player lists, and toast notifications
 */

interface PlayerDisplay {
    id: string;
    name: string;
    color: string;
    isHost?: boolean;
    isConnected?: boolean;
}

interface LobbyListItem {
    id: string;
    name: string;
    playerCount: number;
    maxPlayers: number;
}

class UI {
    private currentScreen = 'lobby-screen';
    private toastContainer: HTMLElement;

    constructor() {
        const el = document.getElementById('toast-container');
        if (!el) throw new Error('toast-container not found');
        this.toastContainer = el;
    }

    showScreen(screenId: string): void {
        document.querySelectorAll('.screen').forEach((screen) => {
            screen.classList.remove('active');
        });
        const targetScreen = document.getElementById(screenId);
        if (targetScreen) {
            targetScreen.classList.add('active');
            this.currentScreen = screenId;
        }
    }

    showToast(message: string, type = 'info', duration = 4000): void {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    setConnectionStatus(status: string): void {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.className = `status ${status}`;
            statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        }
    }

    updatePlayerList(players: Record<string, PlayerDisplay>, currentPlayerId: string | undefined): void {
        const listEl = document.getElementById('player-list');
        if (!listEl) return;
        listEl.innerHTML = '';
        for (const player of Object.values(players)) {
            const li = document.createElement('li');
            li.className = player.isConnected !== false ? '' : 'disconnected';
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

    setLobbyInfo(lobbyName: string, lobbyCode: string): void {
        const nameEl = document.getElementById('game-lobby-name');
        const codeEl = document.getElementById('game-lobby-code');
        if (nameEl) nameEl.textContent = lobbyName;
        if (codeEl) codeEl.textContent = lobbyCode;
    }

    setPlayerInfo(playerName: string, isHost: boolean): void {
        const nameEl = document.getElementById('game-player-name');
        const hostBadge = document.getElementById('host-badge');
        if (nameEl) nameEl.textContent = playerName;
        if (hostBadge) {
            if (isHost) {
                hostBadge.classList.remove('hidden');
            } else {
                hostBadge.classList.add('hidden');
            }
        }
    }

    renderLobbyList(lobbies: LobbyListItem[], onJoinClick: (lobbyId: string) => void): void {
        const listEl = document.getElementById('lobby-list');
        if (!listEl) return;
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

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getInputValue(id: string): string {
        const input = document.getElementById(id) as HTMLInputElement | null;
        return input ? input.value.trim() : '';
    }

    clearInput(id: string): void {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (input) input.value = '';
    }

    setButtonEnabled(id: string, enabled: boolean): void {
        const btn = document.getElementById(id) as HTMLButtonElement | null;
        if (btn) btn.disabled = !enabled;
    }
}
