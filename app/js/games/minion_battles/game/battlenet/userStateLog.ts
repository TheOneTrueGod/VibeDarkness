import type { GameEngine } from '../GameEngine';
import type { OrderAtTick } from '../types';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import { getUserStateLogging } from '../../../../debugFlags';
import { enqueueUserState } from './userStateBatchQueue';

export interface UserStateLogOpts {
    api: MinionBattlesApi;
    playerId: string;
    engine: GameEngine;
    pendingOrders?: OrderAtTick[];
}

export function logUserState({ api, playerId, engine, pendingOrders = [] }: UserStateLogOpts): void {
    if (!getUserStateLogging()) {
        return;
    }
    const lobbyId = api.getLobbyId();
    const baseUrl = api.getLobbyClient().getBaseUrl();

    enqueueUserState(lobbyId, playerId, playerId, baseUrl, {
        tick: engine.gameTick,
        game_state: engine.toJSON(),
        orders: pendingOrders,
    });
}
