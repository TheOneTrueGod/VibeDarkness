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
            const nestId = unit.lanterniteNestOwnerUnitId;
            const far = unit.lanternPatrolFarWorld;
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
                unit.lanternPatrolLeg === 'toFar' ? far : ({ x: nest.x, y: nest.y } as const);
            if (distance(unit.x, unit.y, tgt.x, tgt.y) < ARRIVAL_PX) {
                unit.lanternPatrolLeg = unit.lanternPatrolLeg === 'toFar' ? 'toNest' : 'toFar';
            }

            const dest = unit.lanternPatrolLeg === 'toFar' ? far : { x: nest.x, y: nest.y };

            const grid = context.terrainManager?.grid;
            if (!grid) {
                queueWaitAndEndTurn(unit, context);
                return;
            }
            const from = grid.worldToGrid(unit.x, unit.y);
            const toCell = grid.worldToGrid(dest.x, dest.y);
            const path = context.findGridPathForUnit(unit, from.col, from.row, toCell.col, toCell.row);

            if (path && path.length > 1) {
                unit.setMovement(path.slice(1), undefined, context.gameTick);
            } else if (path && path.length === 1 && (path[0].col !== from.col || path[0].row !== from.row)) {
                unit.setMovement(path, undefined, context.gameTick);
            }

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};
