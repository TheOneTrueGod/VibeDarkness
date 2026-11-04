import { describe, it, expect } from 'vitest';
import { PeerLinkTracker } from './PeerLinkTracker';

function trackerAt(clock: { now: number }): PeerLinkTracker {
    return new PeerLinkTracker(() => clock.now);
}

describe('PeerLinkTracker', () => {
    it('is vacuously linked with no peers', () => {
        const tracker = trackerAt({ now: 0 });
        tracker.update([], {});
        expect(tracker.allLinkedSince(0)).toBe(true);
    });

    it('stamps a link when it opens and keeps the first stamp while it stays open', () => {
        const clock = { now: 100 };
        const tracker = trackerAt(clock);
        tracker.update(['p2'], { p2: true });
        clock.now = 500;
        tracker.update(['p2'], { p2: true });
        expect(tracker.allLinkedSince(100)).toBe(true);
        expect(tracker.allLinkedSince(99)).toBe(false);
    });

    it('a drop resets the stamp, so a link reopened after a poll does not cover it', () => {
        const clock = { now: 100 };
        const tracker = trackerAt(clock);
        tracker.update(['p2'], { p2: true });
        clock.now = 200;
        tracker.update(['p2'], { p2: false });
        expect(tracker.allLinkedSince(300)).toBe(false);
        clock.now = 400;
        tracker.update(['p2'], { p2: true });
        expect(tracker.allLinkedSince(300)).toBe(false);
        expect(tracker.allLinkedSince(400)).toBe(true);
    });

    it('a peer with no reported state counts as down; a peer who left is forgotten', () => {
        const tracker = trackerAt({ now: 0 });
        tracker.update(['p2', 'p3'], { p2: true });
        expect(tracker.allLinkedSince(10)).toBe(false);
        tracker.update(['p2'], { p2: true });
        expect(tracker.allLinkedSince(10)).toBe(true);
    });
});
