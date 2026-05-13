import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatState } from './HeartbeatState';

describe('HeartbeatState', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('starts with zero host tick and null observation time', () => {
        const s = new HeartbeatState();
        expect(s.getLatestHostTick()).toBe(0);
        expect(s.getLastObservedAtMs()).toBeNull();
        expect(s.getLastHeartbeatAgeMs()).toBeNull();
    });

    it('updateLastSeenHeartbeat records host tick and observation time', () => {
        const s = new HeartbeatState();
        s.updateLastSeenHeartbeat(42);
        expect(s.getLatestHostTick()).toBe(42);
        expect(s.getLastObservedAtMs()).not.toBeNull();
    });

    it('getLastHeartbeatAgeMs returns elapsed ms after observation', () => {
        const s = new HeartbeatState();
        s.updateLastSeenHeartbeat(1);
        vi.advanceTimersByTime(500);
        expect(s.getLastHeartbeatAgeMs()).toBe(500);
    });

    it('updateHeartbeatFromAppendResponse ignores stale or invalid hostTick values', () => {
        const s = new HeartbeatState();
        s.updateLastSeenHeartbeat(10);
        s.updateHeartbeatFromAppendResponse({ hostTick: 5 });
        expect(s.getLatestHostTick()).toBe(10);
        s.updateHeartbeatFromAppendResponse({ hostTick: Number.NaN });
        expect(s.getLatestHostTick()).toBe(10);
        s.updateHeartbeatFromAppendResponse({});
        expect(s.getLatestHostTick()).toBe(10);
    });

    it('updateHeartbeatFromAppendResponse advances host tick when newer', () => {
        const s = new HeartbeatState();
        s.updateLastSeenHeartbeat(10);
        s.updateHeartbeatFromAppendResponse({ hostTick: 15 });
        expect(s.getLatestHostTick()).toBe(15);
    });

    it('updateHeartbeatFromAppendResponse accepts the same host tick (>=) to refresh observation', () => {
        const s = new HeartbeatState();
        s.updateLastSeenHeartbeat(10);
        const first = s.getLastObservedAtMs();
        vi.advanceTimersByTime(100);
        s.updateHeartbeatFromAppendResponse({ hostTick: 10 });
        expect(s.getLatestHostTick()).toBe(10);
        expect(s.getLastObservedAtMs()).not.toBe(first);
    });

    it('latestHeartbeatPausedAtTick get/set roundtrip', () => {
        const s = new HeartbeatState();
        expect(s.getLatestPausedAtTick()).toBeNull();
        s.setLatestPausedAtTick(7);
        expect(s.getLatestPausedAtTick()).toBe(7);
        s.setLatestPausedAtTick(null);
        expect(s.getLatestPausedAtTick()).toBeNull();
    });

    it('observeMaterialChange returns false on first observation and stores key', () => {
        const s = new HeartbeatState();
        const changed = s.observeMaterialChange(5, 'fp1');
        expect(changed).toBe(false);
        expect(s.getMaterialKey()).toBe('5|fp1');
        expect(s.didLastPollChangeMaterial()).toBe(false);
    });

    it('observeMaterialChange returns true when host tick or fingerprint changes', () => {
        const s = new HeartbeatState();
        s.observeMaterialChange(5, 'fp1');
        expect(s.observeMaterialChange(6, 'fp1')).toBe(true);
        expect(s.didLastPollChangeMaterial()).toBe(true);
        expect(s.getMaterialKey()).toBe('6|fp1');
    });

    it('observeMaterialChange does not update key for null/empty fingerprint', () => {
        const s = new HeartbeatState();
        s.observeMaterialChange(5, 'fp1');
        expect(s.observeMaterialChange(7, null)).toBe(false);
        expect(s.getMaterialKey()).toBe('5|fp1');
    });

    it('resetMaterialTracking clears material key and last-poll flag', () => {
        const s = new HeartbeatState();
        s.observeMaterialChange(5, 'fp1');
        s.observeMaterialChange(7, 'fp2');
        s.resetMaterialTracking();
        expect(s.getMaterialKey()).toBeNull();
        expect(s.didLastPollChangeMaterial()).toBe(false);
    });
});
