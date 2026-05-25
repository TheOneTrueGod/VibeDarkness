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
const DEFAULT_CONSTRUCTION_SEC = 12;

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

            // Begin construction if arrived
            if (distance(unit.x, unit.y, far.x, far.y) < ARRIVAL_PX) {
                const constructionSec =
                    unit.lanterniteNestConfig?.scoutConstructionSec ?? DEFAULT_CONSTRUCTION_SEC;
                unit.lanterniteConstructionCompleteAtGameTime = context.gameTime + constructionSec;
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // Pathfind toward target
            const grid = context.terrainManager?.grid;
            if (grid) {
                const from = grid.worldToGrid(unit.x, unit.y);
                const to = grid.worldToGrid(far.x, far.y);
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
