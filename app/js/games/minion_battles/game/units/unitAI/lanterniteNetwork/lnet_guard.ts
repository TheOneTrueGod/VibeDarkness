/**
 * Defender guard: patrol a random zone around the home nest.
 * Switches to lnet_chase when an enemy gets close or deals damage.
 */

import { CELL_SIZE } from '../../../../terrain/TerrainGrid';
import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import {
    distance,
    findEnemies,
    getEnemiesInPerceptionAndLOS,
    queueWaitAndEndTurn,
} from '../utils';
import { getPerceptionRange } from '../../unit_defs/unitDef';
import type { LanterniteNetworkAITreeContext, LanterniteNetworkNodeId } from './context';

/** Patrol ring: min and max distance from nest centre (px). */
const PATROL_MIN_DIST_PX = 80;
const PATROL_MAX_DIST_PX = 200;
/** How long to stand at a patrol point before picking the next one (sec). */
const DWELL_TIME_SEC = 1.5;
/** Proximity radius that triggers chase regardless of LOS (px). */
const ALERT_RADIUS_PX = 200;
/** Distance to patrol target considered "arrived" (px). */
const ARRIVAL_THRESHOLD_PX = 40;

export const lnet_guard: AINode<'lanterniteNetwork', LanterniteNetworkNodeId> = {
    nodeId: 'lnet_guard',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as LanterniteNetworkAITreeContext;
            ctx.aiTree = 'lanterniteNetwork';
            ctx.aiState = 'lnet_guard';

            // --- Threat detection ---
            const currentHp = unit.hp;
            const lastHp = ctx.lastKnownHp ?? currentHp;
            ctx.lastKnownHp = currentHp;
            const tookDamage = currentHp < lastHp;

            const allEnemies = findEnemies(unit, context.getUnits());

            // Proximity check (no LOS required — guard senses nearby movement)
            const closeEnemies = allEnemies.filter(
                (e) => distance(unit.x, unit.y, e.x, e.y) <= ALERT_RADIUS_PX,
            );
            closeEnemies.sort(
                (a, b) => distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y),
            );

            let threat = closeEnemies[0];

            // Damage fallback: use perception scan if no nearby enemy visible
            if (!threat && tookDamage) {
                const perceived = getEnemiesInPerceptionAndLOS(
                    unit,
                    allEnemies,
                    getPerceptionRange(unit.characterId),
                    context.hasLineOfSight,
                );
                threat = perceived[0];
            }

            if (threat) {
                ctx.chaseTargetId = threat.id;
                ctx.aiState = 'lnet_chase';
                ctx.patrolTargetX = undefined;
                ctx.patrolTargetY = undefined;
                ctx.dwellStartTime = undefined;
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // --- Patrol ---
            const grid = context.terrainManager?.grid;
            if (!grid) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const nest = unit.lanterniteState.nestOwnerUnitId
                ? context.getUnit(unit.lanterniteState.nestOwnerUnitId)
                : null;
            if (!nest?.isAlive()) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // Walking toward existing patrol target
            if (ctx.patrolTargetX != null && ctx.patrolTargetY != null) {
                const distToTarget = distance(unit.x, unit.y, ctx.patrolTargetX, ctx.patrolTargetY);

                if (distToTarget <= ARRIVAL_THRESHOLD_PX) {
                    // Arrived — dwell
                    if (ctx.dwellStartTime == null) {
                        ctx.dwellStartTime = context.gameTime;
                    }
                    if (context.gameTime - ctx.dwellStartTime >= DWELL_TIME_SEC) {
                        ctx.patrolTargetX = undefined;
                        ctx.patrolTargetY = undefined;
                        ctx.dwellStartTime = undefined;
                    }
                } else if (context.nav.isReachable(unit, Math.floor(ctx.patrolTargetX / CELL_SIZE), Math.floor(ctx.patrolTargetY / CELL_SIZE))) {
                    // Still travelling
                    context.nav.moveToPoint(unit, ctx.patrolTargetX, ctx.patrolTargetY);
                } else {
                    // Unreachable — abandon and pick a new point next turn
                    ctx.patrolTargetX = undefined;
                    ctx.patrolTargetY = undefined;
                }

                queueWaitAndEndTurn(unit, context);
                return;
            }

            // Pick a new patrol point: random angle, distance between min and max from nest
            const angle = (context.generateRandomInteger(0, 628) / 100.0);
            const dist = context.generateRandomInteger(PATROL_MIN_DIST_PX, PATROL_MAX_DIST_PX);
            ctx.patrolTargetX = Math.max(0, Math.min(context.WORLD_WIDTH, nest.x + Math.cos(angle) * dist));
            ctx.patrolTargetY = Math.max(0, Math.min(context.WORLD_HEIGHT, nest.y + Math.sin(angle) * dist));
            ctx.dwellStartTime = undefined;

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'lnet_chase',
            evaluate(unit: Unit): boolean {
                const ctx = unit.aiContext as LanterniteNetworkAITreeContext;
                return ctx.aiState === 'lnet_chase';
            },
        },
    ],
};
