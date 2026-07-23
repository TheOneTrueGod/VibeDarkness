/**
 * pet_ordered_move — Path to a player-ordered destination; suppress auto-engage until arrival.
 *
 * Entered by Order: Move. Cleared on arrival, unreachable destination, heel, or a new order.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { PetAITreeContext, PetNodeId } from './context';
import { queueWaitAndEndTurn, distance } from '../utils';
import { clearPetGuardWander } from './pet_guardWander';

/** Arrival tolerance in world pixels. */
export const PET_ORDERED_MOVE_ARRIVAL_PX = 12;

function clearOrderedMove(ctx: PetAITreeContext): void {
    ctx.orderedMoveX = undefined;
    ctx.orderedMoveY = undefined;
}

function pathToOrderedDest(unit: Unit, context: AIContext, ctx: PetAITreeContext): boolean {
    if (ctx.orderedMoveX === undefined || ctx.orderedMoveY === undefined) return false;
    if (!context.terrainManager) return false;
    const grid = context.terrainManager.grid;
    const from = grid.worldToGrid(unit.x, unit.y);
    const to = grid.worldToGrid(ctx.orderedMoveX, ctx.orderedMoveY);
    if (from.col === to.col && from.row === to.row) return true;
    const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
    if (!path || path.length === 0) return false;
    unit.setMovement(path, undefined, context.gameTick, {
        x: ctx.orderedMoveX,
        y: ctx.orderedMoveY,
    });
    return true;
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
                unit.clearMovement();
                ctx.aiState = 'pet_follow';
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const ok = pathToOrderedDest(unit, context, ctx);
            if (!ok) {
                // Unreachable — drop the order and resume follow.
                clearOrderedMove(ctx);
                unit.clearMovement();
                ctx.aiState = 'pet_follow';
            }

            queueWaitAndEndTurn(unit, context);
        },

        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as PetAITreeContext;
            if (ctx.orderedMoveX === undefined || ctx.orderedMoveY === undefined) return;
            pathToOrderedDest(unit, context, ctx);
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
