import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SerializedGameState } from '../types';
import { enqueueUserState, resetUserStateQueueForTests, setUserStateUploadHold } from './userStateBatchQueue';

const entry = (tick: number) => ({ tick, game_state: { pad: 'x' } as unknown as SerializedGameState, orders: [] });

describe('userStateBatchQueue', () => {
    let resolvers: Array<() => void>;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.useFakeTimers();
        resetUserStateQueueForTests();
        resolvers = [];
        fetchMock = vi.fn(() => new Promise<Response>((resolve) => resolvers.push(() => resolve({} as Response))));
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        resetUserStateQueueForTests();
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    it('keeps one fetch in flight at a time per bucket', async () => {
        for (let i = 0; i < 20; i++) enqueueUserState('L', 'U', 'P', '', entry(i));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        for (let i = 20; i < 40; i++) enqueueUserState('L', 'U', 'P', '', entry(i));
        expect(fetchMock).toHaveBeenCalledTimes(1);
        resolvers[0]();
        await vi.advanceTimersByTimeAsync(0);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('does not POST while held and sends after release', async () => {
        let held = true;
        setUserStateUploadHold(() => held);
        enqueueUserState('L', 'U', 'P', '', entry(1));
        await vi.advanceTimersByTimeAsync(5_000);
        expect(fetchMock).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(fetchMock).not.toHaveBeenCalled();
        held = false;
        await vi.advanceTimersByTimeAsync(5_000);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
