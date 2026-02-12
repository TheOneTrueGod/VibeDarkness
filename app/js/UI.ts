/**
 * UI Manager
 * Facade that delegates to single-purpose modules: screens, toasts, connection status,
 * player list, lobby info, player info, resource display, lobby list, and form helpers.
 */

import type { PlayerState } from './types.js';
import { ToastManager } from './ui/Toast.js';
import { ScreenManager } from './ui/ScreenManager.js';
import { PlayerListRenderer } from './ui/PlayerListRenderer.js';
import {
    LobbyListRenderer,
    type LobbyListItem,
} from './ui/LobbyListRenderer.js';
import {
    ResourceDisplay,
    type ResourceDisplayData,
} from './ui/ResourceDisplay.js';

export type { LobbyListItem, ResourceDisplayData };

export class UI {
    private toast: ToastManager;
    private screen: ScreenManager;
    private playerList: PlayerListRenderer;
    private lobbyList: LobbyListRenderer;
    private resourceDisplay: ResourceDisplay;

    constructor() {
        this.toast = new ToastManager();
        this.screen = new ScreenManager();
        this.playerList = new PlayerListRenderer();
        this.lobbyList = new LobbyListRenderer();
        this.resourceDisplay = new ResourceDisplay();
    }

    showScreen(screenId: string): void {
        this.screen.showScreen(screenId);
    }

    showToast(message: string, type = 'info', duration = 4000): void {
        this.toast.showToast(message, type, duration);
    }

    setConnectionStatus(status: string): void {
        const statusEl = document.getElementById('connection-status');
        if (statusEl) {
            statusEl.className = `status ${status}`;
            statusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
        }
    }

    updatePlayerList(
        players: Record<string, PlayerState>,
        currentPlayerId: string | undefined
    ): void {
        this.playerList.updatePlayerList(players, currentPlayerId);
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

    updateResources(resources: ResourceDisplayData): void {
        this.resourceDisplay.updateResources(resources);
    }

    renderLobbyList(lobbies: LobbyListItem[], onJoinClick: (lobbyId: string) => void): void {
        this.lobbyList.renderLobbyList(lobbies, onJoinClick);
    }

    getInputValue(id: string): string {
        const input = document.getElementById(id) as HTMLInputElement | null;
        return input ? input.value.trim() : '';
    }

    setInputValue(id: string, value: string): void {
        const input = document.getElementById(id) as HTMLInputElement | null;
        if (input) input.value = value;
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
