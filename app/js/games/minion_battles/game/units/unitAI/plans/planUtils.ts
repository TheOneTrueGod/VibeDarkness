import type { Plan, TacticalPlan, InterruptFlag, SerializedTacticalPlan } from './types';

export function createPlan<T>(
    data: T,
    opts: {
        baseTicks: number;
        moveJitter: number;
        maxJitterTicks: number;
        invalidateOn: ReadonlySet<InterruptFlag>;
        currentTick: number;
        path?: { col: number; row: number }[];
    },
): Plan<T> {
    return {
        data,
        holdUntilTick:
            opts.currentTick + opts.baseTicks + Math.floor(opts.moveJitter * opts.maxJitterTicks),
        invalidateOn: opts.invalidateOn,
        pathWaypoints: opts.path,
    };
}

export function shouldReplan<T>(
    plan: Plan<T> | null,
    currentTick: number,
    pendingInterrupts: ReadonlySet<InterruptFlag>,
): boolean {
    if (plan === null) return true;
    if (currentTick >= plan.holdUntilTick) return true;
    for (const flag of pendingInterrupts) {
        if (plan.invalidateOn.has(flag)) return true;
    }
    return false;
}

export function serializeTacticalPlan(
    plan: Plan<TacticalPlan>,
    currentTick: number,
): SerializedTacticalPlan {
    return {
        type: plan.data.type,
        waypointGrid: plan.data.waypointGrid,
        targetUnitId: plan.data.targetUnitId,
        groupCohesionCenter: plan.data.groupCohesionCenter,
        ticksRemaining: Math.max(0, plan.holdUntilTick - currentTick),
    };
}

export function deserializeTacticalPlan(
    serialized: SerializedTacticalPlan,
    currentTick: number,
): Plan<TacticalPlan> {
    return {
        data: {
            type: serialized.type,
            waypointGrid: serialized.waypointGrid,
            targetUnitId: serialized.targetUnitId,
            groupCohesionCenter: serialized.groupCohesionCenter,
        },
        holdUntilTick: currentTick + serialized.ticksRemaining,
        invalidateOn: new Set<InterruptFlag>(),
    };
}
