import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PeerStateStore, GHOST_PLAN_UPDATE_EVENT } from './PeerStateStore';

const PEER_A = 'player-a';
const PEER_B = 'player-b';
const PLAN_V1 = { unitId: 'u1', abilityId: 'a1' };
const PLAN_V2 = { unitId: 'u2', abilityId: 'a2' };
const TICK_100 = 100;
const TICK_200 = 200;
const MS_T0 = 1_000_000;

describe('PeerStateStore', () => {
    let store: PeerStateStore;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(MS_T0);
        store = new PeerStateStore();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('overwrites last inbound state per peer for an event type', () => {
        store.recordInbound(GHOST_PLAN_UPDATE_EVENT, PEER_A, PLAN_V1, TICK_100, MS_T0);
        store.recordInbound(GHOST_PLAN_UPDATE_EVENT, PEER_A, PLAN_V2, TICK_200, MS_T0 + 1);

        const states = store.getPeerStates(GHOST_PLAN_UPDATE_EVENT);
        expect(states[PEER_A]?.payload).toEqual(PLAN_V2);
        expect(states[PEER_A]?.tick).toBe(TICK_200);
    });

    it('records tick and receivedAtMs on inbound state', () => {
        store.recordInbound(GHOST_PLAN_UPDATE_EVENT, PEER_B, PLAN_V1, TICK_100, MS_T0);

        const state = store.getPeerStates(GHOST_PLAN_UPDATE_EVENT)[PEER_B];
        expect(state?.tick).toBe(TICK_100);
        expect(state?.receivedAtMs).toBe(MS_T0);
    });

    it('clearPeer sets null payload for known peers', () => {
        store.recordInbound(GHOST_PLAN_UPDATE_EVENT, PEER_A, PLAN_V1, TICK_100, MS_T0);
        store.clearPeer(PEER_A, MS_T0 + 50);

        const state = store.getPeerStates(GHOST_PLAN_UPDATE_EVENT)[PEER_A];
        expect(state?.payload).toBeNull();
        expect(state?.tick).toBeNull();
        expect(state?.receivedAtMs).toBe(MS_T0 + 50);
    });

    it('getOutboundForResend omits null outbound payloads', () => {
        store.recordOutbound(GHOST_PLAN_UPDATE_EVENT, PLAN_V1, TICK_100);
        expect(store.getOutboundForResend()).toEqual([
            { eventType: GHOST_PLAN_UPDATE_EVENT, payload: PLAN_V1, tick: TICK_100 },
        ]);

        store.recordOutbound(GHOST_PLAN_UPDATE_EVENT, null, null);
        expect(store.getOutboundForResend()).toEqual([]);
    });
});
