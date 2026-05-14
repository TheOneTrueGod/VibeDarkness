import type { BattleOrder } from '../../types';
import type { RemoteOrderWireRow } from '../types';

/** Compact row shape for `lobby_log.jsonl` / console when tracing order replay. */
export type OrderWireLogRow = {
    atTick: number | null;
    idHash: string | null;
    playerId: string | null;
    unitId: string | null;
    abilityId: string | null;
    movePathLen: number | null;
};

function asBattleOrder(order: BattleOrder | Record<string, unknown>): BattleOrder | null {
    if (order && typeof order === 'object' && typeof (order as BattleOrder).unitId === 'string') {
        return order as BattleOrder;
    }
    return null;
}

/** Maps wire rows to a stable JSON-friendly summary (no full targets / paths). */
export function summarizeRemoteWireRowsForLog(orders: RemoteOrderWireRow[]): OrderWireLogRow[] {
    const out: OrderWireLogRow[] = [];
    for (const rec of orders) {
        const atTick = rec.atTick ?? rec.gameTick;
        const bo = asBattleOrder(rec.order as BattleOrder | Record<string, unknown>);
        const idHash = typeof rec.idHash === 'string' && rec.idHash.length > 0 ? rec.idHash : null;
        const playerId = typeof rec.playerId === 'string' && rec.playerId.length > 0 ? rec.playerId : null;
        const mp = bo?.movePath;
        out.push({
            atTick: typeof atTick === 'number' && !Number.isNaN(atTick) ? atTick : null,
            idHash,
            playerId,
            unitId: bo?.unitId ?? null,
            abilityId: bo?.abilityId ?? null,
            movePathLen: mp == null ? null : Array.isArray(mp) ? mp.length : null,
        });
    }
    return out;
}
