import type { BattleNetEventMap, BattleNetListener, BattleNetUnsub } from './types';

/**
 * Typed listener registry for BattleNet events. Owns the listener sets and
 * forwards emit calls to every subscriber for that event.
 */
export class BattleEventBus {
    private readonly listeners: { [K in keyof BattleNetEventMap]: Set<BattleNetListener<K>> } = {
        'sync-status': new Set(),
        'sync-details': new Set(),
        'post-resync-inform': new Set(),
        'host-anchor-wait': new Set(),
        'blocking-host-pause-plane': new Set(),
        'falling-behind': new Set(),
        heartbeat: new Set(),
        'orders-applied': new Set(),
        'host-catchup-wait': new Set(),
        'waiting-for-host-poll-streak': new Set(),
    };

    on<K extends keyof BattleNetEventMap>(event: K, cb: BattleNetListener<K>): BattleNetUnsub {
        this.listeners[event].add(cb);
        return () => {
            this.listeners[event].delete(cb);
        };
    }

    off<K extends keyof BattleNetEventMap>(event: K, cb: BattleNetListener<K>): void {
        this.listeners[event].delete(cb);
    }

    emit<K extends keyof BattleNetEventMap>(event: K, payload: BattleNetEventMap[K]): void {
        for (const cb of this.listeners[event]) {
            cb(payload);
        }
    }
}
