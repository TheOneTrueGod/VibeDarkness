/**
 * sentryPatrol_patrol - Walk the waypoint loop, ignoring everything until disturbed.
 *
 * Disturbed = lost HP since the last tick, or an enemy came within `noticeRangePx` with line of
 * sight. Disturbance wakes this sentry and its nearby fellows (see sentryPatrolAlert.ts).
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import { distance, findEnemies, queueWaitAndEndTurn, ROUND_DURATION } from '../utils';
import type { SentryPatrolAITreeContext, SentryPatrolNodeId } from './context';
import { wakeSentries } from './sentryPatrolAlert';

/** Default px within which a sentry notices an enemy it can see. */
export const DEFAULT_SENTRY_NOTICE_RANGE_PX = 160;
/** How often (in rounds) a patrolling sentry looks around. */
const SCAN_INTERVAL_ROUNDS = 0.25;
/** Distance (px) at which a waypoint counts as reached. */
const ARRIVAL_PX = 24;

function nearestEnemy(unit: Unit, enemies: Unit[]): Unit | undefined {
    let best: Unit | undefined;
    let bestDist = Infinity;
    for (const e of enemies) {
        const d = distance(unit.x, unit.y, e.x, e.y);
        if (d < bestDist) {
            best = e;
            bestDist = d;
        }
    }
    return best;
}

/**
 * The enemy that disturbed the sentry this tick, `null` when it was hurt but no enemy is left to
 * blame, or `undefined` when it is undisturbed.
 */
function findDisturbance(unit: Unit, ctx: SentryPatrolAITreeContext, context: AIContext): Unit | null | undefined {
    const wasHurt = ctx.lastSeenHp !== undefined && unit.hp < ctx.lastSeenHp;
    ctx.lastSeenHp = unit.hp;
    const enemies = findEnemies(unit, context.getUnits());
    if (wasHurt) return nearestEnemy(unit, enemies) ?? null;

    const lastScan = ctx.lastScanTime ?? -Infinity;
    if (context.gameTime - lastScan < SCAN_INTERVAL_ROUNDS * ROUND_DURATION) return undefined;
    ctx.lastScanTime = context.gameTime;
    const range = ctx.noticeRangePx ?? DEFAULT_SENTRY_NOTICE_RANGE_PX;
    const noticed = enemies.filter(
        (e) => distance(unit.x, unit.y, e.x, e.y) <= range && context.hasLineOfSight(unit.x, unit.y, e.x, e.y),
    );
    return nearestEnemy(unit, noticed);
}

export const sentryPatrol_patrol: AINode<'sentryPatrol', SentryPatrolNodeId> = {
    nodeId: 'sentryPatrol_patrol',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as SentryPatrolAITreeContext;
            ctx.aiState = 'sentryPatrol_patrol';

            const disturbance = findDisturbance(unit, ctx, context);
            if (disturbance !== undefined) {
                wakeSentries(unit, disturbance?.id, context);
                return;
            }

            const waypoints = ctx.waypoints ?? [];
            if (waypoints.length > 0) {
                let index = (ctx.waypointIndex ?? 0) % waypoints.length;
                if (distance(unit.x, unit.y, waypoints[index]!.x, waypoints[index]!.y) < ARRIVAL_PX) {
                    index = (index + 1) % waypoints.length;
                }
                ctx.waypointIndex = index;
                context.nav.moveToPoint(unit, waypoints[index]!.x, waypoints[index]!.y);
            }
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};
