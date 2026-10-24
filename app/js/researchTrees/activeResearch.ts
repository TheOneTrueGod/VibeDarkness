/**
 * "Active research": the stored research filtered by what is currently equipped.
 *
 * Weapon nodes hang off virtual roots (`ResearchNodeDef.virtualRootFor`). A virtual root is
 * active only while one of its items is equipped, and counts as researched automatically then.
 * A node that depends on roots (through `prereqNodeIds`, or a same-tree `anyResearched`
 * requirement) is inactive when a prereq is inactive or every option of such a requirement is.
 * Nodes that do not depend on any root are always active.
 * Stored research is never rewritten - consumers read this view instead.
 *
 * Pure: no UI or engine imports.
 */
import { RESEARCH_TREES, getResearchTree } from './list';
import { getVirtualRootItemIds, isVirtualRootNode, type ResearchNodeLevels, type ResearchTreeDef } from './types';

/** Node ids in `tree` that are inactive for this equipment (empty for trees with no virtual roots). */
export function getInactiveResearchNodeIds(
    tree: Pick<ResearchTreeDef, 'id' | 'nodes'>,
    equipment: readonly string[],
): Set<string> {
    const inactive = new Set<string>();
    for (const node of tree.nodes) {
        const items = getVirtualRootItemIds(node);
        if (items.length > 0 && !items.some((id) => equipment.includes(id))) inactive.add(node.id);
    }
    if (inactive.size === 0) return inactive;

    // Propagate to dependents until stable (trees are small).
    let changed = true;
    while (changed) {
        changed = false;
        for (const node of tree.nodes) {
            if (inactive.has(node.id) || isVirtualRootNode(node)) continue;
            const prereqInactive = node.prereqNodeIds.some((id) => inactive.has(id));
            const anyGroupInactive = node.requirements.some(
                (req) =>
                    req.type === 'anyResearched'
                    && req.treeId === tree.id
                    && req.nodeIds.length > 0
                    && req.nodeIds.every((id) => inactive.has(id)),
            );
            if (prereqInactive || anyGroupInactive) {
                inactive.add(node.id);
                changed = true;
            }
        }
    }
    return inactive;
}

/** True unless the node depends on a virtual root whose weapon is not equipped. */
export function isResearchNodeActive(
    tree: Pick<ResearchTreeDef, 'id' | 'nodes'>,
    nodeId: string,
    equipment: readonly string[],
): boolean {
    return !getInactiveResearchNodeIds(tree, equipment).has(nodeId);
}

/** Virtual roots of `tree` that are active for this equipment. */
export function getActiveVirtualRootIds(
    tree: Pick<ResearchTreeDef, 'nodes'>,
    equipment: readonly string[],
): string[] {
    return tree.nodes
        .filter((node) => getVirtualRootItemIds(node).some((id) => equipment.includes(id)))
        .map((node) => node.id);
}

/**
 * Drops inactive nodes, adds every active virtual root (deduplicated), and keeps trees without
 * virtual roots unchanged. Never mutates its input.
 */
export function getActiveResearchTrees(
    researchTrees: Record<string, string[]>,
    equipment: readonly string[],
): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const [treeId, nodeIds] of Object.entries(researchTrees)) {
        const tree = getResearchTree(treeId);
        const inactive = tree ? getInactiveResearchNodeIds(tree, equipment) : new Set<string>();
        result[treeId] = nodeIds.filter((id) => !inactive.has(id));
    }
    for (const tree of RESEARCH_TREES) {
        const roots = getActiveVirtualRootIds(tree, equipment);
        if (roots.length === 0) continue;
        const nodes = result[tree.id] ?? [];
        for (const root of roots) if (!nodes.includes(root)) nodes.push(root);
        result[tree.id] = nodes;
    }
    return result;
}

/** Drops the node levels of inactive nodes. Never mutates its input. */
export function getActiveResearchNodeLevels(
    levels: ResearchNodeLevels,
    equipment: readonly string[],
): ResearchNodeLevels {
    const result: ResearchNodeLevels = {};
    for (const [treeId, nodeLevels] of Object.entries(levels)) {
        const tree = getResearchTree(treeId);
        const inactive = tree ? getInactiveResearchNodeIds(tree, equipment) : new Set<string>();
        result[treeId] = Object.fromEntries(Object.entries(nodeLevels).filter(([id]) => !inactive.has(id)));
    }
    return result;
}
