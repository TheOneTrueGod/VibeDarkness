/**
 * Defender: stay near home nest (within patrol radius); attack opportunistically.
 * Does not chase enemies — moves only to return toward the nest when drifted too far.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import {
    distance,
    findEnemies,
    getEnemiesInPerceptionAndLOS,
    tryQueueAbilityOrder,
    queueWaitAndEndTurn,
} from '../utils';
import { getPerceptionRange } from '../../unit_defs/unitDef';
import type { LanterniteNetworkAITreeContext, LanterniteNetworkNodeId } from './context';

const PATROL_RADIUS_PX = 3 * 40; // 3 tiles
const ROUND_DURATION_SEC = 10;

export const lnet_defend: AINode<'lanterniteNetwork', LanterniteNetworkNodeId> = {
    nodeId: 'lnet_defend',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as LanterniteNetworkAITreeContext;
            ctx.aiTree = 'lanterniteNetwork';
            ctx.aiState = 'lnet_defend';

            // Return toward nest if drifted outside patrol radius
            const nestId = unit.lanterniteNestOwnerUnitId;
            const grid = context.terrainManager?.grid;
            if (nestId && grid) {
                const nest = context.getUnit(nestId);
                if (nest?.isAlive()) {
                    const distToNest = distance(unit.x, unit.y, nest.x, nest.y);
                    if (distToNest > PATROL_RADIUS_PX) {
                        const from = grid.worldToGrid(unit.x, unit.y);
                        const to = grid.worldToGrid(nest.x, nest.y);
                        const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
                        if (path && path.length > 1) {
                            unit.setMovement(path.slice(1), undefined, context.gameTick);
                        }
                    }
                }
            }

            // Opportunistic attack
            if (context.gameTime >= unit.lanterniteAttackReadyAtGameTime) {
                const enemies = findEnemies(unit, context.getUnits());
                const perceptionRange = getPerceptionRange(unit.characterId);
                const inSight = getEnemiesInPerceptionAndLOS(
                    unit,
                    enemies,
                    perceptionRange,
                    context.hasLineOfSight,
                );
                if (tryQueueAbilityOrder(unit, context, inSight)) {
                    unit.lanterniteAttackReadyAtGameTime = context.gameTime + ROUND_DURATION_SEC;
                    return;
                }
            }

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [],
};
