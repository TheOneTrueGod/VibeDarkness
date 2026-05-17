import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AppendLobbyLogBody, LobbyClient } from './LobbyClient';
import {
    enqueueBatchedLobbyLogLine,
    flushLobbyLogBatchQueueForTests,
} from './lobbyLogBatchQueue';

function makeBody(i: number): AppendLobbyLogBody {
    return {
        playerId: 'p1',
        tick: i,
        message: `m${i}`,
        logType: 'debug',
    };
}

describe('lobbyLogBatchQueue', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('POSTs when 5 lines are queued', async () => {
        const appendLobbyLogBatch = vi.fn(async () => {});
        const lobbyClient = {
            appendLobbyLogBatch,
            getBaseUrl: () => '',
        } as unknown as LobbyClient;

        for (let i = 0; i < 5; i++) {
            enqueueBatchedLobbyLogLine({ lobbyClient, lobbyId: 'L1', body: makeBody(i) });
        }

        await vi.waitUntil(() => appendLobbyLogBatch.mock.calls.length > 0);
        expect(appendLobbyLogBatch).toHaveBeenCalledWith('L1', {
            playerId: 'p1',
            lines: [makeBody(0), makeBody(1), makeBody(2), makeBody(3), makeBody(4)],
        });
    });

    it('POSTs on 10s interval when fewer than 5 lines', async () => {
        vi.useFakeTimers();
        const appendLobbyLogBatch = vi.fn(async () => {});
        const lobbyClient = {
            appendLobbyLogBatch,
            getBaseUrl: () => '',
        } as unknown as LobbyClient;

        for (let i = 0; i < 3; i++) {
            enqueueBatchedLobbyLogLine({ lobbyClient, lobbyId: 'L2', body: makeBody(i) });
        }

        await vi.advanceTimersByTimeAsync(10_000);
        await vi.waitUntil(() => appendLobbyLogBatch.mock.calls.length > 0);

        expect(appendLobbyLogBatch).toHaveBeenCalledWith('L2', {
            playerId: 'p1',
            lines: [makeBody(0), makeBody(1), makeBody(2)],
        });
    });

    it('flushLobbyLogBatchQueueForTests drains pending lines', async () => {
        const appendLobbyLogBatch = vi.fn(async () => {});
        const lobbyClient = {
            appendLobbyLogBatch,
            getBaseUrl: () => '',
        } as unknown as LobbyClient;

        enqueueBatchedLobbyLogLine({ lobbyClient, lobbyId: 'L3', body: makeBody(0) });
        expect(appendLobbyLogBatch).not.toHaveBeenCalled();

        await flushLobbyLogBatchQueueForTests();
        expect(appendLobbyLogBatch).toHaveBeenCalledTimes(1);
    });
});
