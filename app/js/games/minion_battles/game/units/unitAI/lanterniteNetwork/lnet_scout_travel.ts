/**
 * Scout travel: pathfind toward target nest POI; opportunistically attack enemies en route.
 * On arrival, begin construction timer and transition to lnet_scout_construct.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import {
    distance,
    findEnemies,
    getEnemiesInPerceptionAndLOS,
    tryQueueAbilityOrder,
    queueWaitAndEndTurn,
} from '../utils';
import { getPerceptionRange } from '../../unit_defs/unitDef';
import type { LanterniteNetworkAITreeContext, LanterniteNetworkNodeId } from './context';

const ARRIVAL_PX = 36;
const ROUND_DURATION_SEC = 10;
const DEFAULT_CONSTRUCTION_SEC = 10;

/**
 * Distance (px) from the nest build site where the scout stands while constructing.
 * Using a slight offset so the scout doesn't overlap the future nest sprite.
 */
const CONSTRUCTION_STAND_RADIUS = 56;

export const lnet_scout_travel: AINode<'lanterniteNetwork', LanterniteNetworkNodeId> = {
    nodeId: 'lnet_scout_travel',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as LanterniteNetworkAITreeContext;
            ctx.aiTree = 'lanterniteNetwork';
            ctx.aiState = 'lnet_scout_travel';

            const far = unit.lanternPatrolFarWorld;
            if (!far || !unit.isAlive()) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // Compute the stand position: offset from the build site at the scout's assigned angle.
            // Each scout has a unique angle (set at spawn) so multiple scouts from the same nest
            // encircle the build site rather than piling on top of each other.
            const angle = unit.lanterniteConstructionAngle ?? 0;
            const standX = far.x + Math.cos(angle) * CONSTRUCTION_STAND_RADIUS;
            const standY = far.y + Math.sin(angle) * CONSTRUCTION_STAND_RADIUS;

            // Begin construction if arrived at stand position
            if (distance(unit.x, unit.y, standX, standY) < ARRIVAL_PX) {
                const constructionSec =
                    unit.lanterniteNestConfig?.scoutConstructionSec ?? DEFAULT_CONSTRUCTION_SEC;
                unit.lanterniteConstructionCompleteAtGameTime = context.gameTime + constructionSec;
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // Pathfind toward stand position (not directly on top of the build site)
            const grid = context.terrainManager?.grid;
            if (grid) {
                const from = grid.worldToGrid(unit.x, unit.y);
                const to = grid.worldToGrid(standX, standY);
                const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
                if (path && path.length > 1) {
                    unit.setMovement(path.slice(1), undefined, context.gameTick);
                }
            }

            // Opportunistic attack (do not chase; just fire if eligible and enemy in range)
            if (context.gameTime >= unit.lanterniteAttackReadyAtGameTime) {
                const enemies = findEnemies(unit, context.getUnits());
                const perceptionRange = getPerceptionRange(unit.characterId);
                const inSight = getEnemiesInPerceptionAndLOS(
                    unit,
                    enemies,
                    perceptionRange,
                    context.hasLineOfSight,
                );
                if (tryQueueAbilityOrder(unit, context, inSight)) {
                    unit.lanterniteAttackReadyAtGameTime = context.gameTime + ROUND_DURATION_SEC;
                    return;
                }
            }

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'lnet_scout_construct',
            evaluate(unit: Unit): boolean {
                return unit.lanterniteConstructionCompleteAtGameTime != null;
            },
        },
    ],
};
