import { useSyncExternalStore } from 'react';
import { getAutoEndTurn, subscribeAutoEndTurn } from '../../game/autoEndTurnSetting';

/** Reactive read of the session's Auto End Turn setting (see {@link getAutoEndTurn}). */
export function useAutoEndTurn(): boolean {
    return useSyncExternalStore(subscribeAutoEndTurn, getAutoEndTurn, getAutoEndTurn);
}
