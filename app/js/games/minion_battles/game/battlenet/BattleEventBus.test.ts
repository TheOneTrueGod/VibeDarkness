import { describe, it, expect, vi } from 'vitest';
import { BattleEventBus } from './BattleEventBus';

describe('BattleEventBus', () => {
    it('invokes registered listeners on emit', () => {
        const bus = new BattleEventBus();
        const cb = vi.fn();
        bus.on('sync-status', cb);
        bus.emit('sync-status', 'synced');
        expect(cb).toHaveBeenCalledWith('synced');
    });

    it('returns an unsubscribe function from on()', () => {
        const bus = new BattleEventBus();
        const cb = vi.fn();
        const unsubscribe = bus.on('sync-details', cb);
        unsubscribe();
        bus.emit('sync-details', 'message');
        expect(cb).not.toHaveBeenCalled();
    });

    it('off() removes a specific listener', () => {
        const bus = new BattleEventBus();
        const a = vi.fn();
        const b = vi.fn();
        bus.on('orders-applied', a);
        bus.on('orders-applied', b);
        bus.off('orders-applied', a);
        bus.emit('orders-applied', { count: 1, source: 'poll' });
        expect(a).not.toHaveBeenCalled();
        expect(b).toHaveBeenCalledWith({ count: 1, source: 'poll' });
    });

    it('supports multiple listeners on the same event in registration order', () => {
        const bus = new BattleEventBus();
        const order: string[] = [];
        bus.on('sync-status', () => order.push('a'));
        bus.on('sync-status', () => order.push('b'));
        bus.on('sync-status', () => order.push('c'));
        bus.emit('sync-status', 'synced');
        expect(order).toEqual(['a', 'b', 'c']);
    });

    it('emit on an event with no listeners is a no-op', () => {
        const bus = new BattleEventBus();
        expect(() => bus.emit('falling-behind', { active: false, ticksBehind: 0 })).not.toThrow();
    });

    it('listeners for different events are isolated', () => {
        const bus = new BattleEventBus();
        const a = vi.fn();
        const b = vi.fn();
        bus.on('sync-status', a);
        bus.on('sync-details', b);
        bus.emit('sync-status', 'failed');
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).not.toHaveBeenCalled();
    });
});
