/**
 * Pure order-building helpers for InteractiveTargetingSession (labels + collected targets -> BattleOrder).
 */

import type { BattleOrder, ResolvedTarget } from '../types';

/** Map frozen select labels to positional targets collected so far (commit + preview orders). */
export function buildPositionalTargetsFromLabels(
    selectLabels: readonly string[],
    collectedTargets: Record<string, ResolvedTarget>,
): ResolvedTarget[] {
    return selectLabels
        .map((label) => collectedTargets[label])
        .filter((t): t is ResolvedTarget => t != null);
}

/** Payload for a movement re-input collected during interactive preview. */
export interface MovementReInput {
    movePath: { col: number; row: number }[];
    moveTargetUnitId?: string;
    moveTargetPixel?: { x: number; y: number };
}

/** Minimal info held for one deferred remote order row. */
export interface HeldRemoteOrder {
    atTick: number;
    order: BattleOrder;
    /** Dedupe key computed at hold time (mirrors BattleSession.appliedRemoteOrderKeys logic). */
    key: string | null;
}

/** True when a held remote row is a stand-in pass matching the preview's assumed wait. */
export function isPurePassOrder(order: BattleOrder): boolean {
    if (order.abilityId !== 'wait' || order.endTurn !== true) return false;
    if (order.movePath != null && order.movePath.length > 0) return false;
    if (order.moveTargetUnitId != null) return false;
    if (order.moveTargetPixel != null) return false;
    if (order.targets != null && order.targets.length > 0) return false;
    if (order.movementByLabel != null && Object.keys(order.movementByLabel).length > 0) return false;
    return true;
}

function resolvedTargetMatches(a: ResolvedTarget, b: ResolvedTarget): boolean {
    if (a.type !== b.type) return false;
    if (a.type === 'unit' && b.type === 'unit') return a.unitId === b.unitId;
    if (a.type === 'pixel' && b.type === 'pixel') {
        return a.position?.x === b.position?.x && a.position?.y === b.position?.y;
    }
    return false;
}

/** Map label → entry in `targets` (same reference) so MeleeAttack indexOf works. */
export function buildTargetsByLabelFromPositional(
    selectLabels: readonly string[],
    collectedTargets: Record<string, ResolvedTarget>,
    targets: ResolvedTarget[],
): Record<string, ResolvedTarget> {
    const targetsByLabel: Record<string, ResolvedTarget> = {};
    for (const label of selectLabels) {
        const collected = collectedTargets[label];
        if (!collected) continue;
        // Prefer the pick itself: when several labels lock the same unit, a value match would hand
        // every label the first step's entry (and its stepAim / lock-ons) - lobby F2DDA5.
        const own = targets.indexOf(collected);
        const idx = own >= 0 ? own : targets.findIndex((t) => resolvedTargetMatches(t, collected));
        targetsByLabel[label] = idx >= 0 ? targets[idx]! : collected;
    }
    return targetsByLabel;
}

/** Build the committed BattleOrder from frozen labels + collected targets/movement (rollback and in-place). */
export function buildFinalizedSequentialTargetingOrder(
    selectLabels: readonly string[],
    collectedTargets: Record<string, ResolvedTarget>,
    baseOrder: BattleOrder,
    movementByLabel?: Record<string, MovementReInput>,
    positionalTargetsOverride?: ResolvedTarget[],
    opts?: { endTurn?: boolean; missingSelectLabels?: readonly string[] },
): BattleOrder {
    // Melee multi-lock override is only valid for a single select label. Multi-select
    // abilities (e.g. Double Punch) must use per-label collected targets.
    const useMeleeOverride =
        selectLabels.length === 1
        && positionalTargetsOverride != null
        && positionalTargetsOverride.length > 0;
    const targets = useMeleeOverride
        ? positionalTargetsOverride
        : buildPositionalTargetsFromLabels(selectLabels, collectedTargets);
    return {
        ...baseOrder,
        targets,
        targetsByLabel: buildTargetsByLabelFromPositional(selectLabels, collectedTargets, targets),
        endTurn: opts?.endTurn ?? true,
        ...(movementByLabel && Object.keys(movementByLabel).length > 0 ? { movementByLabel } : {}),
        // Picks the previewed cast never reached (it ended early). Reaching one in the real timeline
        // pauses the owner for the pick; otherwise the cast fizzles.
        ...(opts?.missingSelectLabels && opts.missingSelectLabels.length > 0
            ? { missingSelectLabels: [...opts.missingSelectLabels] }
            : {}),
    };
}
