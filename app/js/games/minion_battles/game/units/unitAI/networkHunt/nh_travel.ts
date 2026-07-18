/**
 * Network-hunt travel: march hop-by-hop along the mission's node network (see
 * `game/managers/mapNetwork/MapNetworkManager.ts`) toward the nearest enemy-owned structure — a
 * hostile unit tagged `UnitTag.Structure` (a lanternite/swarm nest; `thornling_nest` is
 * deliberately not tagged and so is not a valid target here). Moving from network node
 * to network node (rather than beelining straight at the structure across open terrain) keeps the
 * unit "on the path" the way a patrol would.
 *
 * Periodically scans for any nearby enemy; spotting one switches to nh_engage.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import { distance, findEnemies, findEnemyStructures, getEnemiesInPerceptionAndLOS, everyAITicks, queueWaitAndEndTurn } from '../utils';
import { getPerceptionRange } from '../../unit_defs/unitDef';
import { resolveNearestNodeId, findNodePath } from '../../../managers/mapNetwork/graphSearch';
import type { NetworkHuntAITreeContext, NetworkHuntNodeId } from './context';

type MapNetworkQuery = NonNullable<AIContext['mapNetwork']>;

/** Perception-scan cadence, in game ticks — the "AITicks" throttle requested for this tree,
 *  matching the existing `gameTick % N === 0` idiom used elsewhere (e.g.
 *  `LevelEventManager`'s victory-check throttle, `default_siegeDefendPoint`'s path-retrigger check). */
const ENEMY_SCAN_INTERVAL_TICKS = 10;

interface TravelStep {
    stepTarget: { x: number; y: number };
    targetStructureNodeId?: string;
}

/**
 * Find the nearest enemy structure by graph-hop distance from the unit's current node, and return
 * the next stepping-stone position to walk toward: the next hop's node (staying on the network
 * path), or the structure itself once no further hops remain. Falls back to a straight line at the
 * nearest structure when no structure sits on a graph-reachable node.
 */
function resolveTravelStep(unit: Unit, context: AIContext, mapNetwork: MapNetworkQuery): TravelStep | null {
    const structures = findEnemyStructures(unit, context.getUnits());
    if (structures.length === 0) return null;

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

    if (!bestPath || !bestTarget) {
        structures.sort((a, b) => distance(unit.x, unit.y, a.x, a.y) - distance(unit.x, unit.y, b.x, b.y));
        const fallback = structures[0]!;
        return { stepTarget: { x: fallback.x, y: fallback.y } };
    }

    const nextHopNode = bestPath.length > 1 ? mapNetwork.getNode(bestPath[1]!) : null;
    return {
        stepTarget: nextHopNode ? { x: nextHopNode.x, y: nextHopNode.y } : { x: bestTarget.x, y: bestTarget.y },
        targetStructureNodeId: bestPath[bestPath.length - 1],
    };
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

            // --- Travel: march along the network graph toward the nearest enemy structure ---
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
