import type { ResearchNodeDef, ResearchTreeDef } from './types';

/**
 * Tree levels gate research ranks (a node's `tier`) in core trees.
 *
 * - Rank 10: the tree's core (granted by a mission, never gated here).
 * - Rank 11+: needs tree level `rank - 10` (rank 11 = level 1, rank 12 = level 2, ...).
 *
 * Core Awakening sets the chosen tree to {@link CORE_AWAKENING_TREE_LEVEL}.
 */
export const CORE_RANK = 10;
export const CORE_AWAKENING_TREE_LEVEL = 2;
export const MAX_TREE_LEVEL = 10;

/** Only trees tagged `core` use tree levels. */
export function treeUsesTreeLevels(tree: Pick<ResearchTreeDef, 'tags'>): boolean {
    return !!tree.tags?.includes('core');
}

/** Tree level a node of this rank needs (0 = no requirement). */
export function requiredTreeLevelForRank(rank: number | undefined): number {
    if (rank == null || rank <= CORE_RANK) return 0;
    return rank - CORE_RANK;
}

/** Tree level needed to buy `level` (1-based, default the first) of a node. */
export function requiredTreeLevelForNode(
    tree: Pick<ResearchTreeDef, 'tags'>,
    node: Pick<ResearchNodeDef, 'tier' | 'levelTiers'>,
    level = 1,
): number {
    return treeUsesTreeLevels(tree) ? requiredTreeLevelForRank(getNodeRankForLevel(node, level)) : 0;
}

/** Rank of a node's `level` (1-based): `levelTiers` when given, else `tier`. */
export function getNodeRankForLevel(node: Pick<ResearchNodeDef, 'tier' | 'levelTiers'>, level: number): number | undefined {
    const tiers = node.levelTiers;
    if (tiers && tiers.length > 0) return tiers[Math.min(Math.max(level, 1), tiers.length) - 1];
    return node.tier;
}

export interface TreeLevelSource {
    researchTrees?: Record<string, string[]>;
    researchTreeLevels?: Record<string, number>;
}

/**
 * The character's level in a tree: the stored level, or (legacy characters with no stored level)
 * {@link CORE_AWAKENING_TREE_LEVEL} when the tree's core is researched, else 0.
 */
export function getCharacterTreeLevel(
    character: TreeLevelSource,
    tree: Pick<ResearchTreeDef, 'id' | 'nodes'>,
): number {
    const stored = character.researchTreeLevels?.[tree.id];
    if (typeof stored === 'number') return stored;
    const researched = new Set(character.researchTrees?.[tree.id] ?? []);
    const hasCore = tree.nodes.some(
        (n) => n.tier === CORE_RANK && n.prereqNodeIds.length === 0 && researched.has(n.id),
    );
    return hasCore ? CORE_AWAKENING_TREE_LEVEL : 0;
}
