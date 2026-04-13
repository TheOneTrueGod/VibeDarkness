/**
 * UnitAITree types - Tree-based AI where each unit runs its own AI.
 * Nodes have actions and edge conditions; edges only transition within the same tree (type-safe).
 */

import type { Unit } from '../Unit';
import type { SpecialTile } from '../../specialTiles/SpecialTile';
import type { BattleOrder } from '../../types';

/** Light source for AI (e.g. Torch effect, crystal tile). */
export interface AILightSource {
    id: string;
    col: number;
    row: number;
    emission: number;
    radius: number;
}

/** Read-only context passed to AI nodes. Engine provides implementation. */
export interface AIContext {
    gameTick: number;
    gameTime: number;
    getUnit(id: string): Unit | undefined;
    getUnits(): Unit[];
    getSpecialTiles(): SpecialTile[];
    getAliveDefendPoints(): SpecialTile[];
    getLightSources(): AILightSource[];
    terrainManager: {
        grid: {
            worldToGrid: (x: number, y: number) => { col: number; row: number };
            gridToWorld: (col: number, row: number) => { x: number; y: number };
        };
        findGridPath: (
            fromCol: number,
            fromRow: number,
            toCol: number,
            toRow: number,
        ) => { col: number; row: number }[] | null;
    } | null;
    findGridPathForUnit(
        unit: Unit,
        fromCol: number,
        fromRow: number,
        toCol: number,
        toRow: number,
    ): { col: number; row: number }[] | null;
    queueOrder(atTick: number, order: BattleOrder): void;
    emitTurnEnd(unitId: string): void;
    generateRandomInteger(min: number, max: number): number;
    WORLD_WIDTH: number;
    WORLD_HEIGHT: number;
    hasLineOfSight(fromX: number, fromY: number, toX: number, toY: number): boolean;
    cancelActiveAbility(unitId: string, abilityId: string): void;
    getAbilityUsesThisRound?(unitId: string, abilityId: string): number;
}

/** Node ID within a tree. Format: <tree_name>_<node_name> */
export type AINodeId = string;

/** Edge condition: when true, transition to target node. Target must be in same tree. */
export interface AIEdgeCondition<
    _TTreeName extends string,
    TNodeIds extends AINodeId = AINodeId,
> {
    /** Target node ID (must exist in same tree). */
    targetNodeId: TNodeIds;
    /** Returns true when this edge should be taken. */
    evaluate(unit: Unit, context: AIContext): boolean;
}

/** Actions a node performs when executed. Does NOT directly queue abilities. */
export interface AINodeActions {
    /** Execute this turn's actions (movement, state updates). May trigger ability selection via shared helpers. */
    execute(unit: Unit, context: AIContext): void;
    /** Optional: refresh path when pathfinding retrigger fires. */
    onPathfindingRetrigger?(unit: Unit, context: AIContext): void;
}

/** A single node in a UnitAITree. */
export interface AINode<
    TTreeName extends string,
    TNodeIds extends AINodeId = AINodeId,
> {
    readonly nodeId: TNodeIds;
    readonly actions: AINodeActions;
    /** Edge conditions evaluated in order; first true condition triggers transition. */
    readonly edges: readonly AIEdgeCondition<TTreeName, TNodeIds>[];
}

/** UnitAITree: named tree with nodes. Nodes can only transition to other nodes in this tree. */
export interface UnitAITree<TTreeName extends string = string, TNodeIds extends AINodeId = AINodeId> {
    readonly name: TTreeName;
    readonly entryNodeId: TNodeIds;
    readonly nodes: Readonly<Record<TNodeIds, AINode<TTreeName, TNodeIds>>>;
}

/** Type guard: target node exists in tree. */
export function isNodeInTree<T extends UnitAITree>(
    tree: T,
    nodeId: string,
): nodeId is keyof T['nodes'] {
    return nodeId in tree.nodes;
}
