/**
 * Seek mode: population-gradient hop-by-hop migration + reassign-on-arrival. A swarmling has a
 * `currentNodeId` (last confirmed arrival) and, while moving, a committed `targetNodeId` (the
 * next hop). It does not reconsider its target while in transit — only once it physically
 * arrives, at which point `currentNodeId := targetNodeId` and a fresh decision is made: settle
 * and build if the node is a valid, unclaimed nest site with no strictly-better neighbor, else
 * pick the next hop. This state machine is exclusive to `swarmlingNetwork` — `lanterniteNetwork`
 * and `networkHunt` keep their existing single-target / recompute-fresh models.
 *
 * Switches to snet_hunt when an enemy comes close or deals damage.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import {
    distance,
    findEnemies,
    getEnemiesInPerceptionAndLOS,
    queueWaitAndEndTurn,
} from '../utils';
import { getPerceptionRange } from '../../unit_defs/unitDef';
import type { SwarmlingNetworkAITreeContext, SwarmlingNetworkNodeId } from './context';
import {
    SWARM_DEFAULT_CONSTRUCTION_SEC,
    SWARM_NEST_SWARMLING_CHARACTER_ID,
    isValidUnclaimedBuildNode,
    findUnclaimedNetworkNode,
} from '../../../lanternite/swarmNestTick';
import { resolveNearestNodeId } from '../../../managers/mapNetwork/graphSearch';

/** Distance (px) considered "arrived" at a target network node. */
const ARRIVAL_THRESHOLD_PX = 40;

/** Proximity radius that triggers hunt mode regardless of LOS. */
const ALERT_RADIUS_PX = 200;

type MapNetworkQuery = NonNullable<AIContext['mapNetwork']>;

/** A swarmling's population "vote": in-transit units count toward their committed next hop
 *  (`targetNodeId`), not their physical origin — so a node with movers converging on it reads as
 *  more populated before they've physically arrived, which is what keeps a whole burst from
 *  independently picking the same "currently empty" neighbor. */
function swarmPopulationNodeId(unit: Unit): string | null {
    return unit.swarmState.targetNodeId ?? unit.swarmState.currentNodeId;
}

function countMobileSwarmPopulation(nodeId: string, allUnits: readonly Unit[]): number {
    return allUnits.filter(
        (u) =>
            u.isAlive() &&
            u.characterId === SWARM_NEST_SWARMLING_CHARACTER_ID &&
            swarmPopulationNodeId(u) === nodeId,
    ).length;
}

/**
 * First neighbor of `currentNodeId` (via `getNeighborNodes`, deterministic graph order) with
 * strictly lower population than `currentNodeId` itself — `null` if none qualifies (a local
 * minimum, or an isolated node). "Strictly lower" is the settling condition that keeps two
 * adjacent nodes with equal population from endlessly swapping places.
 */
function pickGradientNeighbor(currentNodeId: string, mapNetwork: MapNetworkQuery, allUnits: readonly Unit[]): string | null {
    const currentPop = countMobileSwarmPopulation(currentNodeId, allUnits);
    for (const neighbor of mapNetwork.getNeighborNodes(currentNodeId)) {
        if (countMobileSwarmPopulation(neighbor.id, allUnits) < currentPop) return neighbor.id;
    }
    return null;
}

export const snet_seek: AINode<'swarmlingNetwork', SwarmlingNetworkNodeId> = {
    nodeId: 'snet_seek',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as SwarmlingNetworkAITreeContext;
            ctx.aiTree = 'swarmlingNetwork';
            ctx.aiState = 'snet_seek';

            // --- Threat detection ---
            const currentHp = unit.hp;
            const lastHp = ctx.lastKnownHp ?? currentHp;
            ctx.lastKnownHp = currentHp;
            const tookDamage = currentHp < lastHp;

            const allEnemies = findEnemies(unit, context.getUnits());

            const closeEnemies = allEnemies.filter(
                (e) => distance(unit.x, unit.y, e.x, e.y) <= ALERT_RADIUS_PX,
            );
            closeEnemies.sort(
                (a, b) => distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y),
            );
            let threat = closeEnemies[0];

            if (!threat && tookDamage) {
                const perceived = getEnemiesInPerceptionAndLOS(
                    unit,
                    allEnemies,
                    getPerceptionRange(unit.characterId),
                    context.hasLineOfSight,
                );
                threat = perceived[0];
            }

            if (threat) {
                ctx.huntTargetId = threat.id;
                ctx.aiState = 'snet_hunt';
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // If construction timer is already set, wait in place until processSwarmNests fires.
            if (unit.swarmState.constructionCompleteAtGameTime != null) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const mapNetwork = context.mapNetwork;
            const grid = context.terrainManager?.grid;
            if (!mapNetwork || !grid) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const allUnits = context.getUnits();

            // --- Arrival: resolve currentNodeId (implicit first arrival at spawn, or explicit
            // reassignment once a committed in-transit hop reaches its target) ---
            if (unit.swarmState.currentNodeId == null) {
                unit.swarmState.currentNodeId = resolveNearestNodeId(unit.x, unit.y, mapNetwork);
            } else if (unit.swarmState.targetNodeId != null) {
                const targetNode = mapNetwork.getNode(unit.swarmState.targetNodeId);
                if (targetNode && distance(unit.x, unit.y, targetNode.x, targetNode.y) < ARRIVAL_THRESHOLD_PX) {
                    unit.swarmState.currentNodeId = unit.swarmState.targetNodeId;
                    unit.swarmState.targetNodeId = null;
                }
            }

            const currentNodeId = unit.swarmState.currentNodeId;
            if (currentNodeId == null) {
                // Empty/unreachable graph — nothing to do.
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // --- Decision: only when stationary (just arrived, or just resolved a fresh spawn) ---
            if (unit.swarmState.targetNodeId == null) {
                if (isValidUnclaimedBuildNode(currentNodeId, mapNetwork, allUnits)) {
                    // Join an existing builder's shared completion time at this same node instead
                    // of starting a fresh timer — processSwarmNests accelerates the shared
                    // completion time based on how many swarmlings are contributing.
                    const existingBuilder = allUnits.find(
                        (u) =>
                            u.id !== unit.id &&
                            u.isAlive() &&
                            u.swarmState.currentNodeId === currentNodeId &&
                            u.swarmState.constructionCompleteAtGameTime != null,
                    );
                    unit.swarmState.constructionCompleteAtGameTime = existingBuilder
                        ? existingBuilder.swarmState.constructionCompleteAtGameTime
                        : context.gameTime + SWARM_DEFAULT_CONSTRUCTION_SEC;
                    queueWaitAndEndTurn(unit, context);
                    return;
                }

                const nextHop =
                    pickGradientNeighbor(currentNodeId, mapNetwork, allUnits) ??
                    findUnclaimedNetworkNode(unit.x, unit.y, mapNetwork, allUnits)?.id ??
                    null;

                if (nextHop == null || nextHop === currentNodeId) {
                    // Already at a local minimum with no unclaimed site to bootstrap toward —
                    // wait and re-decide next tick.
                    queueWaitAndEndTurn(unit, context);
                    return;
                }
                unit.swarmState.targetNodeId = nextHop;
            }

            // --- Movement: whenever a hop is committed ---
            const targetNode = mapNetwork.getNode(unit.swarmState.targetNodeId!);
            if (!targetNode) {
                // Defensive — the graph changed under us (shouldn't happen mid-battle).
                unit.swarmState.targetNodeId = null;
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const needsNewPath = unit.pathInvalidated || !unit.movement || unit.movement.path.length === 0;
            if (needsNewPath) {
                const from = grid.worldToGrid(unit.x, unit.y);
                const to = grid.worldToGrid(targetNode.x, targetNode.y);
                const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
                if (path && path.length > 0) {
                    unit.setMovement(path, undefined, context.gameTick);
                }
            }

            queueWaitAndEndTurn(unit, context);
        },

        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            if (unit.swarmState.constructionCompleteAtGameTime != null) return;
            const targetNodeId = unit.swarmState.targetNodeId;
            if (!targetNodeId) return;
            const mapNetwork = context.mapNetwork;
            const grid = context.terrainManager?.grid;
            if (!mapNetwork || !grid) return;
            const targetNode = mapNetwork.getNode(targetNodeId);
            if (!targetNode) return;
            const from = grid.worldToGrid(unit.x, unit.y);
            const to = grid.worldToGrid(targetNode.x, targetNode.y);
            const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
            if (path && path.length > 0) {
                unit.setMovement(path, undefined, context.gameTick);
            }
        },
    },
    edges: [
        {
            targetNodeId: 'snet_hunt',
            evaluate(unit: Unit): boolean {
                const ctx = unit.aiContext as SwarmlingNetworkAITreeContext;
                return ctx.aiState === 'snet_hunt';
            },
        },
    ],
};
