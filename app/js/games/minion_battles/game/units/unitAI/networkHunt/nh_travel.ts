/**
 * Network-hunt travel: march hop-by-hop along the mission's node network (see
 * `game/managers/mapNetwork/MapNetworkManager.ts`) toward the nearest enemy structure — including
 * invulnerable ones so waves still pressure a nest marked invincible for combat. Empty nest-tagged
 * network nodes (not ally-owned) are also valid destinations so units advance along the chain
 * before a middle nest is built. Moving node-to-node (rather than beelining straight across open
 * terrain) keeps the unit "on the path" the way a patrol would.
 *
 * Periodically scans for any nearby enemy; spotting one switches to nh_engage.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import {
    distance,
    findEnemies,
    findEnemyStructuresForTravel,
    getEnemiesInPerceptionAndLOS,
    everyAITicks,
    queueWaitAndEndTurn,
} from '../utils';
import { getPerceptionRange } from '../../unit_defs/unitDef';
import { resolveNearestNodeId, findNodePath, findNearestNodeByHops } from '../../../managers/mapNetwork/graphSearch';
import { areEnemies } from '../../../teams';
import type { NetworkHuntAITreeContext, NetworkHuntNodeId } from './context';

type MapNetworkQuery = NonNullable<AIContext['mapNetwork']>;

/** Perception-scan cadence, in game ticks — the "AITicks" throttle requested for this tree,
 *  matching the existing `gameTick % N === 0` idiom used elsewhere (e.g.
 *  `LevelEventManager`'s victory-check throttle, `default_siegeDefendPoint`'s path-retrigger check). */
const ENEMY_SCAN_INTERVAL_TICKS = 10;

const NEST_NETWORK_TAG = 'nest';

interface TravelStep {
    stepTarget: { x: number; y: number };
    targetStructureNodeId?: string;
}

/** True when this nest node is a valid outward-march destination for `unit` (empty, or owned by a
 *  hostile character — not by an ally occupying the site). */
function isNonAllyNestDestination(
    unit: Unit,
    nodeId: string,
    mapNetwork: MapNetworkQuery,
    allUnits: readonly Unit[],
): boolean {
    const node = mapNetwork.getNode(nodeId);
    if (!node?.tags.includes(NEST_NETWORK_TAG)) return false;

    const ownerCharacterId = mapNetwork.getOwnerCharacterId(nodeId, allUnits);
    if (ownerCharacterId == null) return true; // empty nest site

    const ownerSample = allUnits.find((u) => u.isAlive() && u.characterId === ownerCharacterId);
    if (!ownerSample) return true;
    return areEnemies(unit.teamId, ownerSample.teamId);
}

/**
 * Next hop toward `destNodeId` from `currentNodeId`, or the destination node's world position when
 * already adjacent / on that node.
 */
function stepTowardNode(
    mapNetwork: MapNetworkQuery,
    currentNodeId: string,
    destNodeId: string,
): TravelStep | null {
    const path = findNodePath(mapNetwork, currentNodeId, destNodeId);
    if (!path) return null;
    const nextHopNode = path.length > 1 ? mapNetwork.getNode(path[1]!) : mapNetwork.getNode(destNodeId);
    if (!nextHopNode) return null;
    return {
        stepTarget: { x: nextHopNode.x, y: nextHopNode.y },
        targetStructureNodeId: destNodeId,
    };
}

/**
 * Find the next stepping-stone along the network toward (1) the nearest enemy structure by hop
 * count, else (2) the nearest empty / enemy-owned nest node, else (3) a straight-line fallback to
 * the nearest enemy structure when none sit on a graph-reachable node.
 */
function resolveTravelStep(unit: Unit, context: AIContext, mapNetwork: MapNetworkQuery): TravelStep | null {
    const allUnits = context.getUnits();
    const structures = findEnemyStructuresForTravel(unit, allUnits);

    const currentNodeId = resolveNearestNodeId(unit.x, unit.y, mapNetwork);
    if (!currentNodeId) return null;

    let bestPath: string[] | null = null;
    let bestTarget: Unit | null = null;
    for (const structure of structures) {
        const node = mapNetwork.findNodeContainingPosition(structure.x, structure.y);
        if (!node) continue;
        const path = findNodePath(mapNetwork, currentNodeId, node.id);
        if (!path) continue;
        if (!bestPath || path.length < bestPath.length) {
            bestPath = path;
            bestTarget = structure;
        }
    }

    if (bestPath && bestTarget) {
        const destNodeId = bestPath[bestPath.length - 1]!;
        const nextHopNode = bestPath.length > 1 ? mapNetwork.getNode(bestPath[1]!) : null;
        return {
            stepTarget: nextHopNode
                ? { x: nextHopNode.x, y: nextHopNode.y }
                : { x: bestTarget.x, y: bestTarget.y },
            targetStructureNodeId: destNodeId,
        };
    }

    // Empty / enemy-owned nest nodes — advance along the chain before a middle nest is built,
    // and when invincible-or-missing structures don't map onto the graph.
    const nestDestId = findNearestNodeByHops(mapNetwork, currentNodeId, (nodeId) => {
        if (nodeId === currentNodeId) return false;
        return isNonAllyNestDestination(unit, nodeId, mapNetwork, allUnits);
    });
    if (nestDestId) {
        const nestStep = stepTowardNode(mapNetwork, currentNodeId, nestDestId);
        if (nestStep) return nestStep;
    }

    if (structures.length > 0) {
        structures.sort((a, b) => distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y));
        const fallback = structures[0]!;
        return { stepTarget: { x: fallback.x, y: fallback.y } };
    }

    return null;
}

export const nh_travel: AINode<'networkHunt', NetworkHuntNodeId> = {
    nodeId: 'nh_travel',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as NetworkHuntAITreeContext;
            ctx.aiTree = 'networkHunt';
            ctx.aiState = 'nh_travel';

            // --- Threat detection: throttled perception scan (immediate on taking a hit) ---
            const currentHp = unit.hp;
            const lastHp = ctx.lastKnownHp ?? currentHp;
            ctx.lastKnownHp = currentHp;
            const tookDamage = currentHp < lastHp;

            if (everyAITicks(context.gameTick, ENEMY_SCAN_INTERVAL_TICKS) || tookDamage) {
                const allEnemies = findEnemies(unit, context.getUnits());
                const spotted = getEnemiesInPerceptionAndLOS(
                    unit,
                    allEnemies,
                    getPerceptionRange(unit.characterId),
                    context.hasLineOfSight,
                );
                if (spotted[0]) {
                    ctx.engageTargetId = spotted[0].id;
                    ctx.aiState = 'nh_engage';
                    queueWaitAndEndTurn(unit, context);
                    return;
                }
            }

            // --- Travel: march along the network graph toward the nearest enemy structure / nest ---
            const mapNetwork = context.mapNetwork;
            const grid = context.terrainManager?.grid;
            if (!mapNetwork || !grid) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const step = resolveTravelStep(unit, context, mapNetwork);
            ctx.currentNodeId = resolveNearestNodeId(unit.x, unit.y, mapNetwork) ?? undefined;
            ctx.targetStructureNodeId = step?.targetStructureNodeId;

            if (!step) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const needsNewPath = unit.pathInvalidated || !unit.movement || unit.movement.path.length === 0;
            if (needsNewPath) {
                const from = grid.worldToGrid(unit.x, unit.y);
                const to = grid.worldToGrid(step.stepTarget.x, step.stepTarget.y);
                const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
                if (path && path.length > 0) unit.setMovement(path, undefined, context.gameTick);
            }

            queueWaitAndEndTurn(unit, context);
        },

        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as NetworkHuntAITreeContext;
            if (ctx.aiState !== 'nh_travel') return;
            const mapNetwork = context.mapNetwork;
            const grid = context.terrainManager?.grid;
            if (!mapNetwork || !grid) return;

            const step = resolveTravelStep(unit, context, mapNetwork);
            if (!step) return;

            const from = grid.worldToGrid(unit.x, unit.y);
            const to = grid.worldToGrid(step.stepTarget.x, step.stepTarget.y);
            const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
            if (path && path.length > 0) unit.setMovement(path, undefined, context.gameTick);
        },
    },
    edges: [
        {
            targetNodeId: 'nh_engage',
            evaluate(unit: Unit): boolean {
                const ctx = unit.aiContext as NetworkHuntAITreeContext;
                return ctx.aiState === 'nh_engage';
            },
        },
    ],
};
