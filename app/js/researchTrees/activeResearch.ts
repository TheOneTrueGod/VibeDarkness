/**
 * "Active research": the stored research filtered by what is currently equipped.
 *
 * Weapon trees are bound to an item (`ResearchTreeDef.boundItem`). A bound tree is only active
 * while its item is equipped; its root node counts as researched automatically (virtual root).
 * Stored research is never rewritten - consumers read this view instead.
 *
 * Pure: no UI or engine imports.
 */
import { RESEARCH_TREES, getResearchTree } from './list';
import type { ResearchNodeLevels, ResearchTreeDef } from './types';

/** Unbound trees are always active; bound trees only while their item is equipped. */
export function isResearchTreeActive(
    tree: Pick<ResearchTreeDef, 'boundItem'>,
    equipment: readonly string[],
): boolean {
    return !tree.boundItem || equipment.includes(tree.boundItem.itemId);
}

/**
 * Drops inactive bound trees, adds the virtual root of every active bound tree (deduplicated),
 * and keeps unbound trees unchanged. Never mutates its input.
 */
export function getActiveResearchTrees(
    researchTrees: Record<string, string[]>,
    equipment: readonly string[],
): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [treeId, nodeIds] of Object.entries(researchTrees)) {
        const tree = getResearchTree(treeId);
        if (tree && !isResearchTreeActive(tree, equipment)) continue;
        result[treeId] = [...nodeIds];
    }
    for (const tree of RESEARCH_TREES) {
        if (!tree.boundItem || !isResearchTreeActive(tree, equipment)) continue;
        const nodes = result[tree.id] ?? [];
        if (!nodes.includes(tree.boundItem.rootNodeId)) nodes.push(tree.boundItem.rootNodeId);
        result[tree.id] = nodes;
    }
    return result;
}

/** Drops the node levels of inactive bound trees. Never mutates its input. */
export function getActiveResearchNodeLevels(
    levels: ResearchNodeLevels,
    equipment: readonly string[],
): ResearchNodeLevels {
    const result: ResearchNodeLevels = {};
    for (const [treeId, nodeLevels] of Object.entries(levels)) {
        const tree = getResearchTree(treeId);
        if (tree && !isResearchTreeActive(tree, equipment)) continue;
        result[treeId] = { ...nodeLevels };
    }
    return result;
}
