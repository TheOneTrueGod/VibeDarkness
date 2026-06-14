/**
 * Hunt mode: move to an orbit position in a ring around the target, then attack.
 * Multiple swarmlings hunting the same target each have a unique orbit angle (set at spawn),
 * causing them to naturally encircle the enemy rather than pile on top of each other.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import { findEnemies, tryQueueAbilityOrder, queueWaitAndEndTurn } from '../utils';
import type { SwarmlingNetworkAITreeContext, SwarmlingNetworkNodeId } from './context';

/** Radius (px) from the hunt target's centre that swarmlings aim to stand at. */
const HUNT_RING_RADIUS = 60;

export const snet_hunt: AINode<'swarmlingNetwork', SwarmlingNetworkNodeId> = {
    nodeId: 'snet_hunt',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as SwarmlingNetworkAITreeContext;
            ctx.aiTree = 'swarmlingNetwork';
            ctx.aiState = 'snet_hunt';

            const target = ctx.huntTargetId ? context.getUnit(ctx.huntTargetId) : null;

            if (!target?.isAlive()) {
                ctx.aiState = 'snet_seek';
                ctx.huntTargetId = undefined;
                ctx.lastKnownHp = undefined;
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // Compute this swarmling's orbit position around the target
            const orbitAngle = unit.swarmlingOrbitAngle ?? 0;
            const orbitX = target.x + Math.cos(orbitAngle) * HUNT_RING_RADIUS;
            const orbitY = target.y + Math.sin(orbitAngle) * HUNT_RING_RADIUS;

            const grid = context.terrainManager?.grid;
            if (grid) {
                const needsNewPath =
                    unit.pathInvalidated ||
                    !unit.movement ||
                    unit.movement.path.length === 0 ||
                    unit.movement.targetUnitId !== target.id;

                if (needsNewPath) {
                    const from = grid.worldToGrid(unit.x, unit.y);
                    const to = grid.worldToGrid(orbitX, orbitY);
                    const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
                    if (path && path.length > 1) {
                        unit.setMovement(path.slice(1), target.id, context.gameTick);
                    } else {
                        unit.clearMovement();
                    }
                }
            }

            // Attack if in range
            const allEnemies = findEnemies(unit, context.getUnits());
            const targetOnly = allEnemies.filter((e) => e.id === ctx.huntTargetId);
            if (tryQueueAbilityOrder(unit, context, targetOnly)) return;

            context.emitTurnEnd(unit.id);
        },

        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as SwarmlingNetworkAITreeContext;
            const target = ctx.huntTargetId ? context.getUnit(ctx.huntTargetId) : null;
            if (!target?.isAlive()) return;
            const grid = context.terrainManager?.grid;
            if (!grid) return;
            const orbitAngle = unit.swarmlingOrbitAngle ?? 0;
            const orbitX = target.x + Math.cos(orbitAngle) * HUNT_RING_RADIUS;
            const orbitY = target.y + Math.sin(orbitAngle) * HUNT_RING_RADIUS;
            const from = grid.worldToGrid(unit.x, unit.y);
            const to = grid.worldToGrid(orbitX, orbitY);
            const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
            if (path && path.length > 1) {
                unit.setMovement(path.slice(1), target.id, context.gameTick);
            }
        },
    },
    edges: [
        {
            targetNodeId: 'snet_seek',
            evaluate(unit: Unit): boolean {
                const ctx = unit.aiContext as SwarmlingNetworkAITreeContext;
                return ctx.aiState === 'snet_seek';
            },
        },
    ],
};
