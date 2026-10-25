/**
 * Move between nest anchor and patrol far-point; swaps legs near arrival.
 */

import type { Unit } from '../../Unit';
import type { AIContext } from '../types';
import type { AINode } from '../types';
import { distance } from '../utils';
import { queueWaitAndEndTurn } from '../utils';
import type { LanternitePatrolAITreeContext, LanternitePatrolNodeId } from './context';
import { lanterniteStateOf } from '../../components/lanterniteComponent';

const ARRIVAL_PX = 36;

export const lantern_patrol: AINode<'lanternitePatrol', LanternitePatrolNodeId> = {
    nodeId: 'lantern_patrol',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const nestId = lanterniteStateOf(unit).nestOwnerUnitId;
            const far = lanterniteStateOf(unit).patrolFarWorld;
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
                lanterniteStateOf(unit).patrolLeg === 'toFar' ? far : ({ x: nest.x, y: nest.y } as const);
            if (distance(unit.x, unit.y, tgt.x, tgt.y) < ARRIVAL_PX) {
                lanterniteStateOf(unit).patrolLeg = lanterniteStateOf(unit).patrolLeg === 'toFar' ? 'toNest' : 'toFar';
            }

            const dest = lanterniteStateOf(unit).patrolLeg === 'toFar' ? far : { x: nest.x, y: nest.y };

            context.nav.moveToPoint(unit, dest.x, dest.y);
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};
