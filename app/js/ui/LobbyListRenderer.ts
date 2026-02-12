/**
 * Lobby list rendering (renderLobbyList)
 */

import { escapeHtml } from '../utils/domUtils.js';

const LOBBY_LIST_ID = 'lobby-list';

export interface LobbyListItem {
    id: string;
    name: string;
    playerCount: number;
    maxPlayers: number;
}

export class LobbyListRenderer {
    renderLobbyList(lobbies: LobbyListItem[], onJoinClick: (lobbyId: string) => void): void {
        const listEl = document.getElementById(LOBBY_LIST_ID);
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
                    <span class="lobby-item-name">${escapeHtml(lobby.name)}</span>
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
}
