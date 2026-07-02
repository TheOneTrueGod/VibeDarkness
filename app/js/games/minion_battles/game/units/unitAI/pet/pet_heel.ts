/**
 * pet_heel — Hold close to owner; no engagement.
 *
 * Keeps within heelTetherRange of the owner. Transitions back to pet_follow
 * once heelUntilGameTime passes.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { PetAITreeContext, PetNodeId } from './context';
import { queueWaitAndEndTurn, distance } from '../utils';

export const pet_heel: AINode<'pet', PetNodeId> = {
    nodeId: 'pet_heel',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as PetAITreeContext;

            if ((ctx.heelUntilGameTime ?? 0) <= context.gameTime) {
                ctx.aiState = 'pet_follow';
                return;
            }

            const owner = unit.petState.ownerUnitId ? context.getUnit(unit.petState.ownerUnitId) : null;
            const tetherRange = ctx.heelTetherRange ?? 30;

            if (owner?.isAlive() && context.terrainManager) {
                const dist = distance(unit.x, unit.y, owner.x, owner.y);
                if (dist > tetherRange) {
                    const grid = context.terrainManager.grid;
                    const from = grid.worldToGrid(unit.x, unit.y);
                    const to = grid.worldToGrid(owner.x, owner.y);
                    const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
                    if (path && path.length > 0) {
                        const truncated = path.length > 1 ? path.slice(0, -1) : path;
                        unit.setMovement(truncated, owner.id, context.gameTick);
                    }
                }
            }

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'pet_follow',
            evaluate(unit: Unit, context: AIContext): boolean {
                const ctx = unit.aiContext as PetAITreeContext;
                return (ctx.heelUntilGameTime ?? 0) <= context.gameTime;
            },
        },
    ],
};
