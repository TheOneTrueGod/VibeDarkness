/**
 * Seek mode: move toward a ring position around the target nest POI, then wait to build a nest.
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
import { SWARM_DEFAULT_CONSTRUCTION_SEC } from '../../../lanternite/swarmNestTick';

/** Distance (px) from the nest POI centre where the swarmling stands while constructing. */
const SEEK_STAND_RADIUS = 56;

/** Distance (px) considered "arrived" at the stand position. */
const ARRIVAL_THRESHOLD_PX = 40;

/** Proximity radius that triggers hunt mode regardless of LOS. */
const ALERT_RADIUS_PX = 200;

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

            // --- Seek logic ---

            // If construction timer is already set, wait in place until processSwarmNests fires.
            if (unit.swarmlingConstructionCompleteAtGameTime != null) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // Resolve target POI world coords
            const targetPoiId = unit.swarmlingTargetNestPoiId;
            const allPois = context.mapPOIs ?? [];
            const targetPoi = targetPoiId ? allPois.find((p) => p.id === targetPoiId) : null;

            if (!targetPoi) {
                // No POI assigned (or no POIs on map) — wait idle
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const grid = context.terrainManager?.grid;
            if (!grid) {
                queueWaitAndEndTurn(unit, context);
                return;
            }

            const poiWorld = grid.gridToWorld(targetPoi.col, targetPoi.row);
            const orbitAngle = unit.swarmlingOrbitAngle ?? 0;
            const standX = poiWorld.x + Math.cos(orbitAngle) * SEEK_STAND_RADIUS;
            const standY = poiWorld.y + Math.sin(orbitAngle) * SEEK_STAND_RADIUS;

            // If arrived at stand position, start construction timer
            if (distance(unit.x, unit.y, standX, standY) < ARRIVAL_THRESHOLD_PX) {
                const constructionSec = SWARM_DEFAULT_CONSTRUCTION_SEC;
                unit.swarmlingConstructionCompleteAtGameTime = context.gameTime + constructionSec;
                queueWaitAndEndTurn(unit, context);
                return;
            }

            // Pathfind toward stand position
            const from = grid.worldToGrid(unit.x, unit.y);
            const to = grid.worldToGrid(standX, standY);
            const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
            if (path && path.length > 1) {
                unit.setMovement(path.slice(1), undefined, context.gameTick);
            }

            queueWaitAndEndTurn(unit, context);
        },

        onPathfindingRetrigger(unit: Unit, context: AIContext): void {
            if (unit.swarmlingConstructionCompleteAtGameTime != null) return;
            const targetPoiId = unit.swarmlingTargetNestPoiId;
            const allPois = context.mapPOIs ?? [];
            const targetPoi = targetPoiId ? allPois.find((p) => p.id === targetPoiId) : null;
            if (!targetPoi) return;
            const grid = context.terrainManager?.grid;
            if (!grid) return;
            const poiWorld = grid.gridToWorld(targetPoi.col, targetPoi.row);
            const orbitAngle = unit.swarmlingOrbitAngle ?? 0;
            const standX = poiWorld.x + Math.cos(orbitAngle) * SEEK_STAND_RADIUS;
            const standY = poiWorld.y + Math.sin(orbitAngle) * SEEK_STAND_RADIUS;
            const from = grid.worldToGrid(unit.x, unit.y);
            const to = grid.worldToGrid(standX, standY);
            const path = context.findGridPathForUnit(unit, from.col, from.row, to.col, to.row);
            if (path && path.length > 1) {
                unit.setMovement(path.slice(1), undefined, context.gameTick);
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
