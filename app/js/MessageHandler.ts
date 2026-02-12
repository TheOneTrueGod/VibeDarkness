/**
 * Poll message handler: applies a single poll message via side-effect callbacks.
 * Used by GameApp for each message in the poll loop.
 */

import { MessageType } from './MessageTypes.js';
import type { ChatMessageData, PlayerState, PollMessagePayload } from './types.js';

export interface PollMessageHandlerContext {
    players: Record<string, PlayerState>;
    currentPlayer: PlayerState | null;
    updatePlayerList: (players: Record<string, PlayerState>, currentPlayerId: string | undefined) => void;
    addMessage: (data: ChatMessageData) => void;
    addSystemMessage: (message: string) => void;
    setClick: (playerId: string, playerName: string, color: string, x: number, y: number) => void;
    setPlayerInfo: (name: string, isHost: boolean) => void;
    showToast: (message: string, type: string) => void;
}

/**
 * Handles a single poll message: dispatches by type and performs the same
 * side effects as the original applyMessage (chat, click, player_join,
 * player_leave, host_changed).
 */
export function handlePollMessage(msg: PollMessagePayload, context: PollMessageHandlerContext): void {
    const { type, data } = msg;
    const {
        players,
        currentPlayer,
        updatePlayerList,
        addMessage,
        addSystemMessage,
        setClick,
        setPlayerInfo,
        showToast,
    } = context;

    if (type === MessageType.CHAT) {
        addMessage(data as ChatMessageData);
    } else if (type === MessageType.CLICK) {
        setClick(
            data.playerId as string,
            data.playerName as string,
            data.color as string,
            data.x as number,
            data.y as number
        );
    } else if (type === MessageType.PLAYER_JOIN) {
        players[data.playerId as string] = {
            id: data.playerId as string,
            name: data.playerName as string,
            color: data.color as string,
            isHost: (data.isHost as boolean) ?? false,
            isConnected: true,
        };
        updatePlayerList(players, currentPlayer?.id);
        addSystemMessage(`${data.playerName as string} joined the game`);
    } else if (type === MessageType.PLAYER_LEAVE) {
        if (players[data.playerId as string]) {
            players[data.playerId as string].isConnected = false;
        }
        updatePlayerList(players, currentPlayer?.id);
        addSystemMessage(`${(data.playerName as string) || 'A player'} left`);
    } else if (type === MessageType.HOST_CHANGED) {
        const newHostId = data.newHostId as string;
        for (const player of Object.values(players)) {
            player.isHost = player.id === newHostId;
        }
        updatePlayerList(players, currentPlayer?.id);
        if (currentPlayer && newHostId === currentPlayer.id) {
            currentPlayer.isHost = true;
            setPlayerInfo(currentPlayer.name, true);
            showToast('You are now the host!', 'info');
        }
        addSystemMessage('Host has changed');
    }
}
