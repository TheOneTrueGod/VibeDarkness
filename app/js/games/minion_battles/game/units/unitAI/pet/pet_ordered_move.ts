/**
 * pet_ordered_move — Walk to a player-ordered destination; suppress auto-engage until arrival.
 *
 * Entered by Order: Move. Cleared on arrival, unreachable destination, heel, or a new order.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { PetAITreeContext, PetNodeId } from './context';
import { queueWaitAndEndTurn, distance } from '../utils';
import { clearPetGuardWander } from './pet_guardWander';
import { CELL_SIZE } from '../../../../terrain/TerrainGrid';

/** Arrival tolerance in world pixels. */
export const PET_ORDERED_MOVE_ARRIVAL_PX = 12;

function clearOrderedMove(ctx: PetAITreeContext): void {
    ctx.orderedMoveX = undefined;
    ctx.orderedMoveY = undefined;
}

export const pet_ordered_move: AINode<'pet', PetNodeId> = {
    nodeId: 'pet_ordered_move',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as PetAITreeContext;

            if ((ctx.heelUntilGameTime ?? 0) > context.gameTime) {
                clearOrderedMove(ctx);
                clearPetGuardWander(ctx);
                ctx.aiState = 'pet_heel';
                return;
            }

            if (ctx.orderedMoveX === undefined || ctx.orderedMoveY === undefined) {
                ctx.aiState = 'pet_follow';
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const dist = distance(unit.x, unit.y, ctx.orderedMoveX, ctx.orderedMoveY);
            if (dist <= PET_ORDERED_MOVE_ARRIVAL_PX) {
                clearOrderedMove(ctx);
                context.nav.stop(unit);
                ctx.aiState = 'pet_follow';
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const toCol = Math.floor(ctx.orderedMoveX / CELL_SIZE);
            const toRow = Math.floor(ctx.orderedMoveY / CELL_SIZE);
            const inDestCell = Math.floor(unit.x / CELL_SIZE) === toCol && Math.floor(unit.y / CELL_SIZE) === toRow;
            if (!inDestCell && !context.nav.isReachable(unit, toCol, toRow)) {
                // Unreachable — drop the order and resume follow.
                clearOrderedMove(ctx);
                context.nav.stop(unit);
                ctx.aiState = 'pet_follow';
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // Exact pixel: the arrival test above is tighter than a cell.
            context.nav.moveToPoint(unit, ctx.orderedMoveX, ctx.orderedMoveY, { exact: true });

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'pet_heel',
            evaluate(unit: Unit, context: AIContext): boolean {
                const ctx = unit.aiContext as PetAITreeContext;
                return (ctx.heelUntilGameTime ?? 0) > context.gameTime;
            },
        },
        {
            targetNodeId: 'pet_follow',
            evaluate(unit: Unit): boolean {
                const ctx = unit.aiContext as PetAITreeContext;
                return ctx.orderedMoveX === undefined || ctx.orderedMoveY === undefined;
            },
        },
    ],
};
