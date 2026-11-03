import { describe, it, expect } from 'vitest';
import { parseBattleSyncNudge } from './useBattleSyncNudges';

describe('parseBattleSyncNudge', () => {
    it('accepts both nudge kinds', () => {
        expect(parseBattleSyncNudge({ type: 'battle_sync_nudge', kind: 'order-appended', atTick: 4 })).toEqual({
            kind: 'order-appended',
            atTick: 4,
        });
        expect(parseBattleSyncNudge({ kind: 'batch-merged', atTick: 9 })).toEqual({ kind: 'batch-merged', atTick: 9 });
    });

    it('rejects unknown kinds and bad ticks', () => {
        expect(parseBattleSyncNudge({ kind: 'apply-this-order', atTick: 4 })).toBeNull();
        expect(parseBattleSyncNudge({ kind: 'batch-merged', atTick: '4' })).toBeNull();
        expect(parseBattleSyncNudge({ kind: 'batch-merged', atTick: Number.NaN })).toBeNull();
    });
});
