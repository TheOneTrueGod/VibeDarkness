/**
 * default_wander - Pick a random walkable tile within radius and move towards it.
 */

import type { Unit } from '../../Unit';
import type { AIContext } from '../types';
import type { AINode } from '../types';
import type { DefaultNodeId } from './context';
import { queueWaitAndEndTurn } from '../utils';

const WANDER_RADIUS = 4;

export const default_wander: AINode<'default', DefaultNodeId> = {
    nodeId: 'default_wander',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const dest = pickRandomWalkableWithinRadius(unit, context);
            if (!dest) {
                queueWaitAndEndTurn(unit, context);
                return;
            }
            context.nav.moveToCell(unit, dest.col, dest.row);
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};

function pickRandomWalkableWithinRadius(
    unit: Unit,
    context: AIContext,
): { col: number; row: number } | null {
    const unitGrid = context.terrainManager?.grid.worldToGrid(unit.x, unit.y);
    if (!unitGrid) return null;
    const from = unitGrid;
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
        if (context.nav.isReachable(unit, c.col, c.row)) return c;
    }
    return null;
}
