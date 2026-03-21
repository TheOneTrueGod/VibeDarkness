/**
 * UnitAITree - Per-unit AI system. Each unit runs its own tree.
 */

import type { UnitAITree } from './types';
import { DEFAULT_AI_TREE } from './default';
import { ALPHA_WOLF_BOSS_AI_TREE } from './alphaWolfBoss';
import { AGGRO_WANDER_AI_TREE } from './aggroWander';

export type { AIContext, AILightSource, UnitAITree, AINode, AIEdgeCondition, AINodeId } from './types';
export { isNodeInTree } from './types';
export { runUnitAI, runPathfindingRetrigger, getCurrentNodeId, setCurrentNodeId } from './runner';
export {
    distance,
    findEnemies,
    getEnemiesInPerceptionAndLOS,
    buildResolvedTargets,
    getDefendPointFromContext,
    getOrPickClosestDefendPoint,
    queueWaitAndEndTurn,
    applyAIMovementToPosition,
    applyAIMovementToUnit,
    pickBestAbility,
    tryQueueAbilityOrder,
} from './utils';
export type { GridLike, ApplyAIMovementParams } from './utils';

export { DEFAULT_AI_TREE } from './default';
export type { DefaultNodeId } from './default';
export { ALPHA_WOLF_BOSS_AI_TREE } from './alphaWolfBoss';
export type { AlphaWolfBossNodeId } from './alphaWolfBoss';
export { AGGRO_WANDER_AI_TREE } from './aggroWander';
export type { AggroWanderNodeId } from './aggroWander';

/** Registry: tree ID -> tree. */
const TREE_REGISTRY: Record<string, UnitAITree> = {
    default: DEFAULT_AI_TREE,
    alphaWolfBoss: ALPHA_WOLF_BOSS_AI_TREE,
    aggroWander: AGGRO_WANDER_AI_TREE,
};

export function getUnitAITree(treeId: string): UnitAITree | null {
    return TREE_REGISTRY[treeId] ?? null;
}
