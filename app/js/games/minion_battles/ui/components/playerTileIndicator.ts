import type { BattleOrder, GhostPlanData, OrderAtTick, WaitingForOrders } from '../../game/types';
import { isLegacySequentialTargetingSentinel } from '../../game/interaction/ghostPlanRenderPolicy';

export type PlayerTileIndicatorColor = 'green' | 'red' | 'blue';

export interface PlayerTileOrderContext {
    waitingForOrders: WaitingForOrders | null;
    pendingOrders: readonly OrderAtTick[];
}

const INDICATOR_TOOLTIPS: Record<
    PlayerTileIndicatorColor,
    { title: string; description: string }
> = {
    green: {
        title: 'Ready',
        description: 'This player is not waiting to submit an order, or has finalized their turn for this batch.',
    },
    red: {
        title: 'Waiting',
        description: 'The battle is waiting on an order from this player and none has been submitted yet.',
    },
    blue: {
        title: 'Planning',
        description:
            'This player is planning or has a non-finalized order in flight (including a live ghost preview).',
    },
};

export function playerTileIndicatorTooltip(color: PlayerTileIndicatorColor): {
    title: string;
    description: string;
} {
    return INDICATOR_TOOLTIPS[color];
}

function orderAtBatchForUnit(
    pendingOrders: readonly OrderAtTick[],
    unitId: string,
    batchAtTick: number,
): BattleOrder | null {
    const row = pendingOrders.find(
        (o) => o.order.unitId === unitId && o.gameTick >= batchAtTick,
    );
    return row?.order ?? null;
}

function hasGhostPlan(ghostPlan: GhostPlanData | null | undefined): boolean {
    return ghostPlan != null && !isLegacySequentialTargetingSentinel(ghostPlan);
}

/**
 * Resolves the indicator lamp colour for a player row on the battle timeline.
 */
export function resolvePlayerTileIndicatorColor(
    playerId: string,
    orderContext: PlayerTileOrderContext,
    ghostPlan: GhostPlanData | null | undefined,
): PlayerTileIndicatorColor {
    const batch = orderContext.waitingForOrders;
    const waitersForPlayer = batch?.waiters.filter((w) => w.ownerId === playerId) ?? [];

    if (waitersForPlayer.length === 0) {
        return hasGhostPlan(ghostPlan) ? 'blue' : 'green';
    }

    const batchAtTick = batch!.atTick;
    let anyNeedsOrder = false;
    let anyPendingNonFinal = false;
    let allFinalized = true;

    for (const waiter of waitersForPlayer) {
        const order = orderAtBatchForUnit(orderContext.pendingOrders, waiter.unitId, batchAtTick);
        if (order == null) {
            anyNeedsOrder = true;
            allFinalized = false;
            continue;
        }
        if (order.endTurn === true) {
            continue;
        }
        anyPendingNonFinal = true;
        allFinalized = false;
    }

    if (hasGhostPlan(ghostPlan)) {
        return 'blue';
    }
    if (anyPendingNonFinal) {
        return 'blue';
    }
    if (anyNeedsOrder) {
        return 'red';
    }
    if (allFinalized) {
        return 'green';
    }
    return 'red';
}
