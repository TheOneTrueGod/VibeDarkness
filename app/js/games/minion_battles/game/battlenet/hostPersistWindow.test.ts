import { describe, it, expect } from 'vitest';
import { FIXED_DT } from '../GameEngine';
import { HOST_PLAYAHEAD_CAP_SEC, HOST_PLAYAHEAD_CAP_TICKS } from './constants';
import {
    hostPlayaheadTicksAhead,
    isAppendAtTickAccepted,
    isHostPlayaheadOverCap,
    maxAllowedAppendTick,
} from './hostPersistWindow';

/** Lobby 97305C: disk still on pause 225 while host Wait POSTed at 330. */
const LOBBY_97305C_HOST_TICK = 224;
const LOBBY_97305C_ORDER_BATCH_AT_TICK = 225;
const LOBBY_97305C_WAIT_AT_TICK = 330;
const LOBBY_97305C_AFTER_ACK_HOST_TICK = 329;

describe('hostPersistWindow', () => {
    it('maxAllowedAppendTick matches PHP max(hostTick + 1, orderBatchAtTick ?? -1)', () => {
        expect(maxAllowedAppendTick(LOBBY_97305C_HOST_TICK, LOBBY_97305C_ORDER_BATCH_AT_TICK)).toBe(
            LOBBY_97305C_ORDER_BATCH_AT_TICK,
        );
        expect(maxAllowedAppendTick(LOBBY_97305C_AFTER_ACK_HOST_TICK, LOBBY_97305C_WAIT_AT_TICK)).toBe(
            LOBBY_97305C_WAIT_AT_TICK,
        );
        expect(maxAllowedAppendTick(10, null)).toBe(11);
    });

    it('97305C: Wait atTick is rejected until snapshot ACK opens the window', () => {
        expect(
            isAppendAtTickAccepted(
                LOBBY_97305C_WAIT_AT_TICK,
                LOBBY_97305C_HOST_TICK,
                LOBBY_97305C_ORDER_BATCH_AT_TICK,
            ),
        ).toBe(false);
        expect(
            isAppendAtTickAccepted(
                LOBBY_97305C_WAIT_AT_TICK,
                LOBBY_97305C_AFTER_ACK_HOST_TICK,
                LOBBY_97305C_WAIT_AT_TICK,
            ),
        ).toBe(true);
    });

    it('rejects atTick at or behind hostTick (PHP tick_in_past)', () => {
        expect(
            isAppendAtTickAccepted(
                LOBBY_97305C_HOST_TICK,
                LOBBY_97305C_HOST_TICK,
                LOBBY_97305C_ORDER_BATCH_AT_TICK,
            ),
        ).toBe(false);
    });

    it('playahead cap is HOST_PLAYAHEAD_CAP_SEC of FIXED_DT ticks', () => {
        expect(HOST_PLAYAHEAD_CAP_TICKS).toBe(Math.round(HOST_PLAYAHEAD_CAP_SEC / FIXED_DT));
    });

    it('HOST_PLAYAHEAD_CAP_TICKS over ACK is over cap; one tick under is not', () => {
        const acknowledgedCompletedTick = 100;
        expect(
            hostPlayaheadTicksAhead(
                acknowledgedCompletedTick + HOST_PLAYAHEAD_CAP_TICKS,
                acknowledgedCompletedTick,
            ),
        ).toBe(HOST_PLAYAHEAD_CAP_TICKS);
        expect(
            isHostPlayaheadOverCap(
                acknowledgedCompletedTick + HOST_PLAYAHEAD_CAP_TICKS,
                acknowledgedCompletedTick,
            ),
        ).toBe(true);
        expect(
            isHostPlayaheadOverCap(
                acknowledgedCompletedTick + HOST_PLAYAHEAD_CAP_TICKS - 1,
                acknowledgedCompletedTick,
            ),
        ).toBe(false);
    });
});
