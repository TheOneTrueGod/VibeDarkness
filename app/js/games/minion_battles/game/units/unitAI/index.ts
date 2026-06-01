/**
 * UnitAITree - Per-unit AI system. Each unit runs its own tree.
 */

import type { UnitAITree } from './types';
import { DEFAULT_AI_TREE } from './default';
import { ALPHA_WOLF_BOSS_AI_TREE } from './alphaWolfBoss';
import { AGGRO_WANDER_AI_TREE } from './aggroWander';
import { LANTERNITE_PATROL_AI_TREE } from './lanternitePatrol/index';
import { LANTERNITE_NEST_IDLE_TREE } from './lanterniteNestIdle/index';
import { LANTERNITE_NETWORK_AI_TREE } from './lanterniteNetwork/index';
import { HUNT_AI_TREE } from './hunt/index';

export type { AIContext, AILightSource, UnitAITree, AINode, AIEdgeCondition, AINodeId } from './types';
export { isNodeInTree } from './types';
export { runUnitAI, runPathfindingRetrigger, getCurrentNodeId, setCurrentNodeId } from './runner';
export {
    ROUND_DURATION,
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

export type {
    UnitAIContext,
    UnitAIContextBase,
    UnitAIContextUninitialized,
    AITreeContextMap,
    AITreeId,
} from './contextTypes';
export { initTreeContext } from './contextTypes';

export { DEFAULT_AI_TREE } from './default';
export type { DefaultNodeId, DefaultAITreeContext } from './default';
export { ALPHA_WOLF_BOSS_AI_TREE } from './alphaWolfBoss';
export type { AlphaWolfBossNodeId, AlphaWolfBossAITreeContext } from './alphaWolfBoss';
export { AGGRO_WANDER_AI_TREE } from './aggroWander';
export type { AggroWanderNodeId, AggroWanderAITreeContext } from './aggroWander';

export { LANTERNITE_PATROL_AI_TREE } from './lanternitePatrol/index';
export type { LanternitePatrolAITreeContext } from './lanternitePatrol/context';
export { LANTERNITE_NETWORK_AI_TREE } from './lanterniteNetwork/index';
export type { LanterniteNetworkAITreeContext, LanterniteNetworkNodeId } from './lanterniteNetwork/context';
export { HUNT_AI_TREE } from './hunt/index';
export type { HuntNodeId, HuntAITreeContext } from './hunt/index';

/** Registry: tree ID -> tree. */
const TREE_REGISTRY: Record<string, UnitAITree> = {
    default: DEFAULT_AI_TREE,
    alphaWolfBoss: ALPHA_WOLF_BOSS_AI_TREE,
    aggroWander: AGGRO_WANDER_AI_TREE,
    lanternitePatrol: LANTERNITE_PATROL_AI_TREE,
    lanterniteNestIdle: LANTERNITE_NEST_IDLE_TREE,
    lanterniteNetwork: LANTERNITE_NETWORK_AI_TREE,
    hunt: HUNT_AI_TREE,
};

export function getUnitAITree(treeId: string): UnitAITree | null {
    return TREE_REGISTRY[treeId] ?? null;
}
