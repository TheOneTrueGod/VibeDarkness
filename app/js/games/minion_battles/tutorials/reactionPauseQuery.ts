/**
 * The one place tutorials read the reaction pause. Step 10 stores a serialized `reactionPending` on the
 * waiting UNIT (not on the `OrderWaiter`); a waiter owned by the player whose unit has it set is a
 * reaction pause. The view is structural so tests can pass a stub.
 */
export interface ReactionPauseEngineView {
    waitingForOrders: { waiters: readonly { unitId: string; ownerId: string }[] } | null;
    getUnit(id: string): { reactionPending?: unknown } | undefined | null;
}

/** Whether `playerId` owns a waiter whose unit has `reactionPending` in the open order pause. */
export function isLocalPlayerInReactionPause(engine: ReactionPauseEngineView | null | undefined, playerId: string | null | undefined): boolean {
    if (!engine || !playerId) return false;
    const waiters = engine.waitingForOrders?.waiters ?? [];
    return waiters.some((w) => w.ownerId === playerId && engine.getUnit(w.unitId)?.reactionPending != null);
}
