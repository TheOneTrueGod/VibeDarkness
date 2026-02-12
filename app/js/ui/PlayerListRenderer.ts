/**
 * Player list rendering (updatePlayerList)
 */

import { escapeHtml } from '../utils/domUtils.js';
import type { PlayerState } from '../types.js';

const PLAYER_LIST_ID = 'player-list';

export class PlayerListRenderer {
    updatePlayerList(
        players: Record<string, PlayerState>,
        currentPlayerId: string | undefined
    ): void {
        const listEl = document.getElementById(PLAYER_LIST_ID);
        if (!listEl) return;
        listEl.innerHTML = '';
        for (const player of Object.values(players)) {
            const li = document.createElement('li');
            li.className = player.isConnected !== false ? '' : 'disconnected';
            let html = `<span class="player-dot" style="background-color: ${player.color}"></span>`;
            html += `<span>${escapeHtml(player.name)}</span>`;
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
}
