/**
 * Waking a sentry: it and every sleeping sentry nearby on the same team and tree turn hostile.
 * One hop only — the newly woken sentries do not wake their own neighbours.
 */

import type { Unit } from '../../Unit';
import type { AIContext } from '../types';
import { distance } from '../utils';
import type { SentryPatrolAITreeContext } from './context';

/** Default px radius within which a disturbed sentry wakes its fellows. */
export const DEFAULT_SENTRY_ALERT_RADIUS_PX = 300;

/** True while the unit runs the sentryPatrol tree and has not yet been disturbed. */
export function isSleepingSentry(unit: Unit): boolean {
    const ctx = unit.aiContext as Partial<SentryPatrolAITreeContext>;
    return unit.unitAITreeId === 'sentryPatrol' && ctx.aiState !== 'sentryPatrol_hostile';
}

function turnHostile(unit: Unit, targetUnitId: string | undefined): void {
    const ctx = unit.aiContext as SentryPatrolAITreeContext;
    ctx.aiTree = 'sentryPatrol';
    ctx.aiState = 'sentryPatrol_hostile';
    if (targetUnitId !== undefined) ctx.targetUnitId = targetUnitId;
    ctx.lastScanTime = undefined;
}

/** Wake `unit` and every sleeping sentry within its alert radius. Returns the woken units (self first). */
export function wakeSentries(unit: Unit, targetUnitId: string | undefined, context: AIContext): Unit[] {
    const ctx = unit.aiContext as SentryPatrolAITreeContext;
    const radius = ctx.alertRadiusPx ?? DEFAULT_SENTRY_ALERT_RADIUS_PX;
    const woken: Unit[] = [unit];
    turnHostile(unit, targetUnitId);
    for (const other of context.getUnits()) {
        if (other === unit || !other.isAlive() || other.teamId !== unit.teamId) continue;
        if (other.unitAITreeId !== unit.unitAITreeId || !isSleepingSentry(other)) continue;
        if (distance(unit.x, unit.y, other.x, other.y) > radius) continue;
        turnHostile(other, targetUnitId);
        woken.push(other);
    }
    return woken;
}
