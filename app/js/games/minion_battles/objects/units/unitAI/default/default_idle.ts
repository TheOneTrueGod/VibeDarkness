/**
 * default_idle - Entry node. Scans for enemies, defend points, or light; otherwise wanders.
 */

import type { Unit } from '../../../Unit';
import type { AIContext, AILightSource } from '../types';
import type { AINode } from '../types';
import { findEnemies, getEnemiesInPerceptionAndLOS, queueWaitAndEndTurn } from '../utils';
import { getPerceptionRange } from '../../../../engine/unitDef';
import { distance } from '../utils';
import { getOrPickClosestDefendPoint } from '../utils';

const TREE_NAME = 'default';
type DefaultNodeId = 'default_idle' | 'default_attack' | 'default_siegeDefendPoint' | 'default_findLight' | 'default_wander';

function getOrPickDefendPoint(unit: Unit, context: AIContext): { id: string } | null {
    const defendPoints = context.getAliveDefendPoints();
    const grid = context.terrainManager?.grid ?? null;
    const picked = getOrPickClosestDefendPoint(unit, defendPoints, grid);
    return picked ? { id: picked.id } : null;
}


export const default_idle: AINode<typeof TREE_NAME, DefaultNodeId> = {
    nodeId: 'default_idle',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const didTransition =
                tryTransitionToAttack(unit, context) ||
                tryTransitionToSiegeDefendPoint(unit, context) ||
                tryTransitionToFindLight(unit, context) ||
                transitionToWander(unit, context);
            // Don't emit here; the target node will emit when it finishes (runner recurses).
        },
    },
    edges: [],
};

function tryTransitionToAttack(unit: Unit, context: AIContext): boolean {
    const perceptionRange = getPerceptionRange(unit.characterId);
    const enemies = findEnemies(unit, context.getUnits());
    const inSight = getEnemiesInPerceptionAndLOS(
        unit,
        enemies,
        perceptionRange,
        context.hasLineOfSight.bind(context),
    );
    if (inSight.length > 0) {
        const target = inSight[context.generateRandomInteger(0, inSight.length - 1)]!;
        unit.aiContext = { ...unit.aiContext, unitAINodeId: 'default_attack', aiTargetUnitId: target.id };
        return true;
    }
    return false;
}

function tryTransitionToSiegeDefendPoint(unit: Unit, context: AIContext): boolean {
    const dp = getOrPickDefendPoint(unit, context);
    if (!dp) return false;
    unit.aiContext = {
        ...unit.aiContext,
        unitAINodeId: 'default_siegeDefendPoint',
        defensePointTargetId: dp.id,
    };
    return true;
}

function tryTransitionToFindLight(unit: Unit, context: AIContext): boolean {
    const sources = context.getLightSources();
    if (sources.length === 0) return false;
    const grid = context.terrainManager?.grid;
    if (!grid) return false;
    const unitGrid = grid.worldToGrid(unit.x, unit.y);
    let nearest: AILightSource | null = null;
    let nearestDist = Infinity;
    for (const s of sources) {
        const d = distance(unitGrid.col, unitGrid.row, s.col, s.row);
        if (d < nearestDist) {
            nearestDist = d;
            nearest = s;
        }
    }
    if (nearest) {
        unit.aiContext = { ...unit.aiContext, unitAINodeId: 'default_findLight', findLightSourceId: nearest.id };
        return true;
    }
    return false;
}

function transitionToWander(unit: Unit): boolean {
    unit.aiContext = { ...unit.aiContext, unitAINodeId: 'default_wander' };
    return true;
}
