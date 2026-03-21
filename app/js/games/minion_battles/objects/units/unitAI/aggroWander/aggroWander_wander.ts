/**
 * aggroWander_wander - Wander near starting position; transition to attack on enemy detection.
 *
 * Records the unit's starting grid cell on first execution.
 * Periodically picks a random walkable tile within maxWanderDistance of start.
 * Scans for enemies at scanIntervalRounds and transitions to attack when one is found.
 */

import type { Unit } from '../../../Unit';
import type { AIContext } from '../types';
import type { AINode } from '../types';
import { findEnemies, getEnemiesInPerceptionAndLOS, queueWaitAndEndTurn } from '../utils';
import { getPerceptionRange } from '../../../../engine/unitDef';

const TREE_NAME = 'aggroWander';
type AggroWanderNodeId = 'aggroWander_wander' | 'aggroWander_attack';

const ROUND_DURATION = 10;

/** How often (in rounds) the unit picks a new wander destination. */
export const WANDER_INTERVAL_ROUNDS = 0.5;

/** Max grid distance (Chebyshev) the unit may wander from its starting cell. */
export const MAX_WANDER_DISTANCE = 2;

/** How often (in rounds) the unit scans for nearby enemies. */
export const SCAN_INTERVAL_ROUNDS = 0.25;

export const aggroWander_wander: AINode<typeof TREE_NAME, AggroWanderNodeId> = {
    nodeId: 'aggroWander_wander',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const grid = context.terrainManager?.grid;
            if (!grid) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const ai = unit.aiContext;

            if (ai.aggroWanderStartCol == null || ai.aggroWanderStartRow == null) {
                const start = grid.worldToGrid(unit.x, unit.y);
                ai.aggroWanderStartCol = start.col;
                ai.aggroWanderStartRow = start.row;
            }

            const lastScan = ai.aggroWanderLastScanTime ?? -Infinity;
            if (context.gameTime - lastScan >= SCAN_INTERVAL_ROUNDS * ROUND_DURATION) {
                ai.aggroWanderLastScanTime = context.gameTime;
                const perceptionRange = getPerceptionRange(unit.characterId);
                const enemies = findEnemies(unit, context.getUnits());
                const inSight = getEnemiesInPerceptionAndLOS(
                    unit,
                    enemies,
                    perceptionRange,
                    context.hasLineOfSight.bind(context),
                );
                if (inSight.length > 0) {
                    const nearest = inSight[0]!;
                    unit.aiContext = {
                        ...unit.aiContext,
                        unitAINodeId: 'aggroWander_attack',
                        aiTargetUnitId: nearest.id,
                    };
                    return;
                }
            }

            const lastMove = ai.aggroWanderLastMoveTime ?? -Infinity;
            if (context.gameTime - lastMove >= WANDER_INTERVAL_ROUNDS * ROUND_DURATION) {
                ai.aggroWanderLastMoveTime = context.gameTime;
                const unitGrid = grid.worldToGrid(unit.x, unit.y);
                const dest = pickRandomWalkableNearStart(
                    unitGrid,
                    ai.aggroWanderStartCol!,
                    ai.aggroWanderStartRow!,
                    MAX_WANDER_DISTANCE,
                    unit,
                    context,
                );
                if (dest) {
                    const path = context.findGridPathForUnit(unit, unitGrid.col, unitGrid.row, dest.col, dest.row);
                    if (path && path.length > 0) {
                        unit.setMovement(path, undefined, context.gameTick);
                    }
                }
            }

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};

function pickRandomWalkableNearStart(
    from: { col: number; row: number },
    startCol: number,
    startRow: number,
    maxDist: number,
    unit: Unit,
    context: AIContext,
): { col: number; row: number } | null {
    const candidates: { col: number; row: number }[] = [];
    for (let dc = -maxDist; dc <= maxDist; dc++) {
        for (let dr = -maxDist; dr <= maxDist; dr++) {
            if (dc === 0 && dr === 0) continue;
            const col = startCol + dc;
            const row = startRow + dr;
            if (col === from.col && row === from.row) continue;
            candidates.push({ col, row });
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
