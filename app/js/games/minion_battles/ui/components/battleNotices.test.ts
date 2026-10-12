import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    buildPresetNotice,
    createBattleNoticeStore,
    starburstClipPath,
    type BattleNotice,
} from './battleNotices';

const notice = (id: string, extra: Partial<BattleNotice> = {}): BattleNotice => ({
    id,
    title: id,
    minVisibleMs: 1000,
    ...extra,
});

describe('createBattleNoticeStore', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('is empty initially', () => {
        expect(createBattleNoticeStore().getNotices()).toEqual([]);
    });

    it('release before minVisibleMs keeps the notice until the time elapses', () => {
        const store = createBattleNoticeStore();
        const listener = vi.fn();
        store.subscribe(listener);
        store.show(notice('a'));
        vi.advanceTimersByTime(400);
        store.release('a');
        expect(store.getNotices()).toHaveLength(1);
        vi.advanceTimersByTime(599);
        expect(store.getNotices()).toHaveLength(1);
        vi.advanceTimersByTime(1);
        expect(store.getNotices()).toHaveLength(0);
        expect(listener).toHaveBeenCalledTimes(2);
    });

    it('release after minVisibleMs removes immediately', () => {
        const store = createBattleNoticeStore();
        store.show(notice('a'));
        vi.advanceTimersByTime(1500);
        store.release('a');
        expect(store.getNotices()).toHaveLength(0);
    });

    it('showing the same id replaces the notice and cancels a pending release', () => {
        const store = createBattleNoticeStore();
        store.show(notice('a', { title: 'first' }));
        store.release('a');
        store.show(notice('a', { title: 'second' }));
        expect(store.getNotices()).toHaveLength(1);
        expect(store.getNotices()[0].title).toBe('second');
        vi.advanceTimersByTime(5000);
        expect(store.getNotices()).toHaveLength(1);
    });

    it('unsubscribe stops notifications', () => {
        const store = createBattleNoticeStore();
        const listener = vi.fn();
        const off = store.subscribe(listener);
        off();
        store.show(notice('a'));
        expect(listener).not.toHaveBeenCalled();
    });
});

describe('buildPresetNotice', () => {
    it('fills the ability name into pick_required', () => {
        const n = buildPresetNotice('pick_required', { abilityName: 'Rock Slide' });
        expect(n.detail).toContain('Rock Slide');
        expect(n.title).toBe('Target needed');
    });
});

describe('starburstClipPath', () => {
    it('returns 2 x spikes points inside 0-100%', () => {
        const css = starburstClipPath(12, 0.85);
        const pairs = [...css.matchAll(/(-?\d+(?:\.\d+)?)% (-?\d+(?:\.\d+)?)%/g)];
        expect(pairs).toHaveLength(24);
        for (const m of pairs) {
            expect(Number(m[1])).toBeGreaterThanOrEqual(0);
            expect(Number(m[1])).toBeLessThanOrEqual(100);
            expect(Number(m[2])).toBeGreaterThanOrEqual(0);
            expect(Number(m[2])).toBeLessThanOrEqual(100);
        }
    });
});
