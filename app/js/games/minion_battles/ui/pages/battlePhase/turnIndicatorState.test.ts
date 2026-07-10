import { describe, it, expect } from 'vitest';
import { computeTurnIndicatorProps } from './turnIndicatorState';
import type { WaitingForOrders } from '../../../game/types';
import type { PlayerState } from '../../../../../types';

function waiting(waiters: WaitingForOrders['waiters']): WaitingForOrders {
    return { waiters, atTick: 10 };
}

const ME = 'player-me';
const ALLY = 'player-ally';

const players: Record<string, PlayerState> = {
    [ME]: { id: ME, name: 'Me', color: 'red' },
    [ALLY]: { id: ALLY, name: 'Ally', color: 'blue' },
};

describe('computeTurnIndicatorProps', () => {
    it.each([
        {
            name: 'no waitingForOrders -> playing, no ally name',
            waitingForOrders: null,
            storyPauseActive: false,
            canUseOrderUi: false,
            playerId: ME,
            players,
            expected: { state: 'playing', allyName: undefined },
        },
        {
            name: 'storyPauseActive -> playing even with an ally waiter (allyName still resolved)',
            waitingForOrders: waiting([{ unitId: 'u1', ownerId: ME }, { unitId: 'u2', ownerId: ALLY }]),
            storyPauseActive: true,
            canUseOrderUi: false,
            playerId: ME,
            players,
            expected: { state: 'playing', allyName: 'Ally' },
        },
        {
            name: 'canUseOrderUi -> your_turn (allyName still resolved independently)',
            waitingForOrders: waiting([{ unitId: 'u1', ownerId: ME }, { unitId: 'u2', ownerId: ALLY }]),
            storyPauseActive: false,
            canUseOrderUi: true,
            playerId: ME,
            players,
            expected: { state: 'your_turn', allyName: 'Ally' },
        },
        {
            name: 'ally waiter, cannot act -> ally_turn with correct allyName',
            waitingForOrders: waiting([{ unitId: 'u2', ownerId: ALLY }]),
            storyPauseActive: false,
            canUseOrderUi: false,
            playerId: ME,
            players,
            expected: { state: 'ally_turn', allyName: 'Ally' },
        },
        {
            name: 'ally waiter with unknown player id -> allyName falls back to "Player"',
            waitingForOrders: waiting([{ unitId: 'u2', ownerId: 'unknown-player' }]),
            storyPauseActive: false,
            canUseOrderUi: false,
            playerId: ME,
            players,
            expected: { state: 'ally_turn', allyName: 'Player' },
        },
        {
            name: 'only own waiters and cannot act -> playing, no ally name',
            waitingForOrders: waiting([{ unitId: 'u1', ownerId: ME }]),
            storyPauseActive: false,
            canUseOrderUi: false,
            playerId: ME,
            players,
            expected: { state: 'playing', allyName: undefined },
        },
    ] as const)('$name', ({ waitingForOrders, storyPauseActive, canUseOrderUi, playerId, players, expected }) => {
        const result = computeTurnIndicatorProps({
            waitingForOrders,
            storyPauseActive,
            canUseOrderUi,
            playerId,
            players,
        });
        expect(result).toEqual(expected);
    });
});
