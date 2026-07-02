/**
 * pet_return — Return to the owner, ignoring enemies.
 *
 * Pathfinds directly to the owner. Transitions to pet_follow once close enough.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { PetAITreeContext, PetNodeId } from './context';
import { queueWaitAndEndTurn, distance } from '../utils';

const FOLLOW_DISTANCE = 50;

export const pet_return: AINode<'pet', PetNodeId> = {
    nodeId: 'pet_return',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as PetAITreeContext;

            // Heel overrides return
            if ((ctx.heelUntilGameTime ?? 0) > context.gameTime) {
                ctx.aiState = 'pet_heel';
                return;
            }

            const owner = unit.petState.ownerUnitId ? context.getUnit(unit.petState.ownerUnitId) : null;

            if (!owner?.isAlive()) {
                ctx.aiState = 'pet_follow';
                return;
            }

            const dist = distance(unit.x, unit.y, owner.x, owner.y);
            if (dist <= FOLLOW_DISTANCE) {
                ctx.aiState = 'pet_follow';
                return;
            }

            if (context.terrainManager) {
                const grid = context.terrainManager.grid;
                const from = grid.worldToGrid(unit.x, unit.y);
                const to = grid.worldToGrid(owner.x, owner.y);
                const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
                if (path && path.length > 0) {
                    const truncated = path.length > 1 ? path.slice(0, -1) : path;
                    unit.setMovement(truncated, owner.id, context.gameTick);
                }
            }

            queueWaitAndEndTurn(unit, context);
        },

        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const owner = unit.petState.ownerUnitId ? context.getUnit(unit.petState.ownerUnitId) : null;
            if (!owner?.isAlive() || !context.terrainManager) return;
            const grid = context.terrainManager.grid;
            const from = grid.worldToGrid(unit.x, unit.y);
            const to = grid.worldToGrid(owner.x, owner.y);
            const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
            if (path && path.length > 0) {
                const truncated = path.length > 1 ? path.slice(0, -1) : path;
                unit.setMovement(truncated, owner.id, context.gameTick);
            }
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
            evaluate(unit: Unit, context: AIContext): boolean {
                const owner = unit.petState.ownerUnitId ? context.getUnit(unit.petState.ownerUnitId) : null;
                if (!owner?.isAlive()) return true;
                return distance(unit.x, unit.y, owner.x, owner.y) <= FOLLOW_DISTANCE;
            },
        },
    ],
};
