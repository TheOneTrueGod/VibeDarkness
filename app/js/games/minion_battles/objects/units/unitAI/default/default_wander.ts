/**
 * default_wander - Pick a random walkable tile within radius and move towards it.
 */

import type { Unit } from '../../../Unit';
import type { AIContext } from '../types';
import type { AINode } from '../types';
import type { DefaultNodeId } from './context';
import { queueWaitAndEndTurn } from '../utils';

const TREE_NAME = 'default';

const WANDER_RADIUS = 4;

export const default_wander: AINode<typeof TREE_NAME, DefaultNodeId> = {
    nodeId: 'default_wander',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const terrainManager = context.terrainManager;
            if (!terrainManager?.grid) {
                queueWaitAndEndTurn(unit, context);
                return;
            }
            const grid = terrainManager.grid;
            const unitGrid = grid.worldToGrid(unit.x, unit.y);
            const dest = pickRandomWalkableWithinRadius(unitGrid, unit, context);
            if (!dest) {
                queueWaitAndEndTurn(unit, context);
                return;
            }
            const path = context.findGridPathForUnit(unit, unitGrid.col, unitGrid.row, dest.col, dest.row);
            if (path && path.length > 0) {
                unit.setMovement(path, undefined, context.gameTick);
            }
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};

function pickRandomWalkableWithinRadius(
    from: { col: number; row: number },
    unit: Unit,
    context: AIContext,
): { col: number; row: number } | null {
    const candidates: { col: number; row: number }[] = [];
    for (let dc = -WANDER_RADIUS; dc <= WANDER_RADIUS; dc++) {
        for (let dr = -WANDER_RADIUS; dr <= WANDER_RADIUS; dr++) {
            if (dc === 0 && dr === 0) continue;
            candidates.push({ col: from.col + dc, row: from.row + dr });
        }
    }
    for (let tries = 0; tries < 20; tries++) {
        if (candidates.length === 0) return null;
        const idx = context.generateRandomInteger(0, candidates.length - 1);
        const c = candidates[idx]!;
        const path = context.findGridPathForUnit(unit, from.col, from.row, c.col, c.row);
        if (path && path.length > 0) return c;
    }
    return null;
}
