import type { Dispatch, SetStateAction } from 'react';
import type { MessageEntry } from '../components/Chat';
import type { ClickData } from '../components/GameCanvas';
import type { AccountState, LobbyState, PlayerState } from '../types';
import type { useToast } from '../contexts/ToastContext';
import type { useUserData } from '../user/UserDataProvider';

export type ShowToast = ReturnType<typeof useToast>['showToast'];
export type UserDataUser = ReturnType<typeof useUserData>['user'];

/** State setters owned by AppInner and shared with the lobby flow hooks. */
export interface LobbySessionSetters {
    setScreen: Dispatch<SetStateAction<'lobby' | 'game'>>;
    setCurrentLobby: Dispatch<SetStateAction<LobbyState | null>>;
    setCurrentPlayer: Dispatch<SetStateAction<PlayerState | null>>;
    setCurrentAccount: Dispatch<SetStateAction<AccountState | null>>;
    setPlayers: Dispatch<SetStateAction<Record<string, PlayerState>>>;
    setChatMessages: Dispatch<SetStateAction<MessageEntry[]>>;
    setChatEnabled: Dispatch<SetStateAction<boolean>>;
    setClicks: Dispatch<SetStateAction<Record<string, ClickData>>>;
    setConnectionStatus: Dispatch<SetStateAction<'disconnected' | 'connecting' | 'connected'>>;
    setLobbyPageState: Dispatch<SetStateAction<'home' | 'in_game'>>;
    setLobbyGameId: Dispatch<SetStateAction<string | null>>;
    setLobbyGameType: Dispatch<SetStateAction<string | null>>;
    setLobbyGameData: Dispatch<SetStateAction<Record<string, unknown> | null>>;
    setCurrentCampaignId: Dispatch<SetStateAction<string | null>>;
    setLastPollMessageId: Dispatch<SetStateAction<number | null>>;
    setPollMessagesReady: Dispatch<SetStateAction<boolean>>;
}
