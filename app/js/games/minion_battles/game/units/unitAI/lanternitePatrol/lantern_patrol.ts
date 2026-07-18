/**
 * Move between nest anchor and patrol far-point; swaps legs near arrival.
 */

import type { Unit } from '../../Unit';
import type { AIContext } from '../types';
import type { AINode } from '../types';
import { distance } from '../utils';
import { queueWaitAndEndTurn } from '../utils';
import type { LanternitePatrolAITreeContext, LanternitePatrolNodeId } from './context';

const ARRIVAL_PX = 36;

export const lantern_patrol: AINode<'lanternitePatrol', LanternitePatrolNodeId> = {
    nodeId: 'lantern_patrol',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const nestId = unit.lanterniteState.nestOwnerUnitId;
            const far = unit.lanterniteState.patrolFarWorld;
            const ctxAi = unit.aiContext as LanternitePatrolAITreeContext;
            ctxAi.aiTree = 'lanternitePatrol';
            ctxAi.aiState = 'lantern_patrol';

            if (!nestId || !far || !unit.isAlive()) {
                queueWaitAndEndTurn(unit, context);
                return;
            }
            const nest = context.getUnit(nestId);
            if (!nest?.isAlive()) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const tgt =
                unit.lanterniteState.patrolLeg === 'toFar' ? far : ({ x: nest.x, y: nest.y } as const);
            if (distance(unit.x, unit.y, tgt.x, tgt.y) < ARRIVAL_PX) {
                unit.lanterniteState.patrolLeg = unit.lanterniteState.patrolLeg === 'toFar' ? 'toNest' : 'toFar';
            }

            const dest = unit.lanterniteState.patrolLeg === 'toFar' ? far : { x: nest.x, y: nest.y };

            const grid = context.terrainManager?.grid;
            if (!grid) {
                queueWaitAndEndTurn(unit, context);
                return;
            }
            const from = grid.worldToGrid(unit.x, unit.y);
            const toCell = grid.worldToGrid(dest.x, dest.y);
            const path = context.findGridPathForUnit(unit, from.col, from.row, toCell.col, toCell.row);

            if (path && path.length > 0) {
                unit.setMovement(path, undefined, context.gameTick);
            }

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};
