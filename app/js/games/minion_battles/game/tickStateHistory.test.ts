import { describe, expect, it } from 'vitest';
import type { SerializedGameState } from './types';
import {
    TICK_STATE_HISTORY_CAPACITY,
    TickStateHistory,
} from './tickStateHistory';

function record(gameTick: number): {
    syncHash: string;
    gameTick: number;
    gameState: SerializedGameState;
} {
    return {
        syncHash: `hash-${gameTick}`,
        gameTick,
        gameState: { gameTick } as SerializedGameState,
    };
}

describe('TickStateHistory', () => {
    it('keeps a ring buffer of the last TICK_STATE_HISTORY_CAPACITY ticks', () => {
        const ring = new TickStateHistory();
        for (let i = 1; i <= TICK_STATE_HISTORY_CAPACITY + 3; i++) {
            ring.push(record(i));
        }
        const history = ring.getHistory();
        expect(history).toHaveLength(TICK_STATE_HISTORY_CAPACITY);
        expect(history[0]!.gameTick).toBe(4);
        expect(history[history.length - 1]!.gameTick).toBe(TICK_STATE_HISTORY_CAPACITY + 3);
        expect(history[0]!.syncHash).toBe('hash-4');
    });

    it('clear empties the ring', () => {
        const ring = new TickStateHistory();
        ring.push(record(1));
        ring.clear();
        expect(ring.getHistory()).toHaveLength(0);
    });
});
