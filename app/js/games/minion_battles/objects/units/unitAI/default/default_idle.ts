/**
 * default_idle - Entry node. Scans for enemies, defend points, or light; otherwise wanders.
 */

import type { Unit } from '../../../Unit';
import type { AIContext, AILightSource } from '../types';
import type { AINode } from '../types';
import type { DefaultAITreeContext, DefaultNodeId } from './context';
import { findEnemies, getEnemiesInPerceptionAndLOS, queueWaitAndEndTurn } from '../utils';
import { getPerceptionRange } from '../../../../engine/unitDef';
import { distance } from '../utils';
import { getOrPickClosestDefendPoint } from '../utils';

const TREE_NAME = 'default';

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
                transitionToWander(unit);
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
        const ctx = unit.aiContext as DefaultAITreeContext;
        ctx.aiState = 'default_attack';
        ctx.targetUnitId = target.id;
        return true;
    }
    return false;
}

function tryTransitionToSiegeDefendPoint(unit: Unit, context: AIContext): boolean {
    const dp = getOrPickDefendPoint(unit, context);
    if (!dp) return false;
    const ctx = unit.aiContext as DefaultAITreeContext;
    ctx.aiState = 'default_siegeDefendPoint';
    ctx.defensePointTargetId = dp.id;
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
        const ctx = unit.aiContext as DefaultAITreeContext;
        ctx.aiState = 'default_findLight';
        ctx.findLightSourceId = nearest.id;
        return true;
    }
    return false;
}

function transitionToWander(unit: Unit): boolean {
    const ctx = unit.aiContext as DefaultAITreeContext;
    ctx.aiState = 'default_wander';
    return true;
}
