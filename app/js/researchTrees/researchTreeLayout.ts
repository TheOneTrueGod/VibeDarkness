/**
 * Node placement for the Upgrades tree view.
 *
 * - `graph` trees (default) use each node's authored `position`.
 * - `rows` trees (Weapons) put every virtual root at the start of its own row, in node order,
 *   with the nodes that depend on it stretching to the right one column per dependency step.
 *   A node that depends on several roots (e.g. More Rock) sits in the first of their rows, after
 *   that row's own upgrades.
 *   Nodes that depend on no root share a trailing row.
 *
 * Pure: no UI imports.
 */
import { isVirtualRootNode, type ResearchNodeDef, type ResearchTreeDef } from './types';

export interface ResearchNodePosition {
    x: number;
    y: number;
}

export const ROW_LAYOUT_ORIGIN_X = 120;
export const ROW_LAYOUT_ORIGIN_Y = 90;
export const ROW_LAYOUT_COLUMN_WIDTH = 250;
export const ROW_LAYOUT_ROW_HEIGHT = 160;

/** Same-tree nodes this node hangs off: its prereqs plus every same-tree `anyResearched` option. */
export function getResearchNodeDependencyIds(treeId: string, node: ResearchNodeDef): string[] {
    const ids = [...node.prereqNodeIds];
    for (const req of node.requirements) {
        if (req.type === 'anyResearched' && req.treeId === treeId) ids.push(...req.nodeIds);
    }
    return [...new Set(ids)];
}

/** Grid cell (row, column) of every node in `nodes` for a `rows` tree. */
export function computeResearchTreeRowCells(
    tree: Pick<ResearchTreeDef, 'id'>,
    nodes: readonly ResearchNodeDef[],
): Map<string, { row: number; column: number }> {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const roots = nodes.filter(isVirtualRootNode);
    const rowOfRoot = new Map(roots.map((n, i) => [n.id, i]));
    const looseRow = roots.length;

    const placement = new Map<string, { row: number; depth: number }>();
    const resolve = (node: ResearchNodeDef, visiting: Set<string>): { row: number; depth: number } => {
        const known = placement.get(node.id);
        if (known) return known;
        const rootRow = rowOfRoot.get(node.id);
        if (rootRow !== undefined) {
            const p = { row: rootRow, depth: 0 };
            placement.set(node.id, p);
            return p;
        }
        visiting.add(node.id);
        let row = looseRow;
        let depth = 0;
        for (const depId of getResearchNodeDependencyIds(tree.id, node)) {
            const dep = byId.get(depId);
            if (!dep || visiting.has(depId)) continue;
            const p = resolve(dep, visiting);
            if (p.row < looseRow) row = Math.min(row, p.row);
            depth = Math.max(depth, p.depth + 1);
        }
        visiting.delete(node.id);
        const p = { row, depth };
        placement.set(node.id, p);
        return p;
    };

    // Shared nodes (several dependencies, shown or not) are placed after each row's own upgrades.
    const isShared = (node: ResearchNodeDef) => getResearchNodeDependencyIds(tree.id, node).length > 1;
    const ordered = [...nodes].sort((a, b) => Number(isShared(a)) - Number(isShared(b)));

    const cells = new Map<string, { row: number; column: number }>();
    const taken = new Set<string>();
    for (const node of ordered) {
        const { row, depth } = resolve(node, new Set());
        let column = depth;
        while (taken.has(`${row}:${column}`)) column++;
        taken.add(`${row}:${column}`);
        cells.set(node.id, { row, column });
    }
    return cells;
}

/** Centre position of every node in `nodes` (already filtered to what the view shows). */
export function computeResearchTreeNodePositions(
    tree: Pick<ResearchTreeDef, 'id' | 'layout'>,
    nodes: readonly ResearchNodeDef[],
): Map<string, ResearchNodePosition> {
    const out = new Map<string, ResearchNodePosition>();
    if (tree.layout !== 'rows') {
        for (const n of nodes) out.set(n.id, n.position ?? { x: ROW_LAYOUT_ORIGIN_X, y: ROW_LAYOUT_ORIGIN_Y });
        return out;
    }
    for (const [id, { row, column }] of computeResearchTreeRowCells(tree, nodes)) {
        out.set(id, {
            x: ROW_LAYOUT_ORIGIN_X + column * ROW_LAYOUT_COLUMN_WIDTH,
            y: ROW_LAYOUT_ORIGIN_Y + row * ROW_LAYOUT_ROW_HEIGHT,
        });
    }
    return out;
}
