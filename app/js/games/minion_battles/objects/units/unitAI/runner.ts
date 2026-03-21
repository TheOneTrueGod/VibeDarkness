/**
 * UnitAITree runner - executes a unit's AI tree and handles node transitions.
 */

import type { Unit } from '../../Unit';
import type { AIContext } from './types';
import type { UnitAITree } from './types';
import { isNodeInTree } from './types';

/** Key for current node in unit.aiContext. */
const AI_NODE_KEY = 'unitAINodeId';

/** Get the unit's current AI node ID. */
export function getCurrentNodeId(unit: Unit): string | undefined {
    return unit.aiContext?.unitAINodeId as string | undefined;
}

/** Set the unit's current AI node ID. */
export function setCurrentNodeId(unit: Unit, nodeId: string): void {
    unit.aiContext = { ...unit.aiContext, unitAINodeId: nodeId };
}

/**
 * Run one AI turn for the unit using its assigned tree.
 * Evaluates edges, transitions if needed, then executes the current node's actions.
 */
export function runUnitAI<T extends UnitAITree>(
    unit: Unit,
    tree: T,
    context: AIContext,
): void {
    let currentNodeId = getCurrentNodeId(unit) ?? tree.entryNodeId;
    if (!isNodeInTree(tree, currentNodeId)) {
        currentNodeId = tree.entryNodeId;
        setCurrentNodeId(unit, currentNodeId);
    }

    const node = tree.nodes[currentNodeId as keyof typeof tree.nodes];
    if (!node) {
        setCurrentNodeId(unit, tree.entryNodeId);
        return;
    }

    // Evaluate edges
    for (const edge of node.edges) {
        if (!isNodeInTree(tree, edge.targetNodeId)) continue;
        if (edge.evaluate(unit, context)) {
            setCurrentNodeId(unit, edge.targetNodeId);
            runUnitAI(unit, tree, context);
            return;
        }
    }

    node.actions.execute(unit, context);

    // If execute transitioned (e.g. default_idle -> default_wander), recurse
    const afterNodeId = getCurrentNodeId(unit);
    if (afterNodeId !== currentNodeId && isNodeInTree(tree, afterNodeId ?? '')) {
        runUnitAI(unit, tree, context);
    }
}

/**
 * Called when pathfinding retrigger fires. Runs current node's onPathfindingRetrigger if present.
 */
export function runPathfindingRetrigger<T extends UnitAITree>(
    unit: Unit,
    tree: T,
    context: AIContext,
): void {
    const currentNodeId = getCurrentNodeId(unit) ?? tree.entryNodeId;
    const node = tree.nodes[currentNodeId as keyof typeof tree.nodes];
    if (node?.actions.onPathfindingRetrigger) {
        node.actions.onPathfindingRetrigger(unit, context);
    }
}
