import { describe, expect, it } from 'vitest';
import { hostPersistQueueAlertModel } from './hostPersistQueueAlert';

describe('hostPersistQueueAlertModel', () => {
    it('is null at depth 0', () => {
        expect(hostPersistQueueAlertModel({ depth: 0, oldestAgeMs: 5000, capBlocking: false })).toBeNull();
    });

    it('is null before the show-after delay', () => {
        expect(hostPersistQueueAlertModel({ depth: 1, oldestAgeMs: 500, capBlocking: false })).toBeNull();
    });

    it('is info for depth 1 after the delay', () => {
        const m = hostPersistQueueAlertModel({ depth: 1, oldestAgeMs: 800, capBlocking: false });
        expect(m).toMatchObject({
            title: 'Waiting on server',
            summary: '1 save queued up',
            tone: 'info',
            busy: true,
        });
        expect(m?.detail).toBeUndefined();
    });

    it('is warning at depths 3 and 5, danger at 6', () => {
        expect(hostPersistQueueAlertModel({ depth: 3, oldestAgeMs: 800, capBlocking: false })?.tone).toBe('warning');
        expect(hostPersistQueueAlertModel({ depth: 5, oldestAgeMs: 800, capBlocking: false })?.tone).toBe('warning');
        const danger = hostPersistQueueAlertModel({ depth: 6, oldestAgeMs: 800, capBlocking: false });
        expect(danger?.tone).toBe('danger');
        expect(danger?.summary).toBe('6 saves queued up');
    });

    it('adds the detail line when the cap is blocking', () => {
        const m = hostPersistQueueAlertModel({ depth: 2, oldestAgeMs: 900, capBlocking: true });
        expect(m?.detail).toBe('Orders resume when saves catch up.');
    });
});
