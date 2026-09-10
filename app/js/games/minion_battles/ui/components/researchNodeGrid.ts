import {
    canResearchNode,
    collectResearchedNodeIds,
    computeEffectiveResourcesForTree,
    meetsAll,
    selectableResearchNodes,
    type ResearchContext,
} from '../../../../researchTrees/evaluator';
import { getResearchNode } from '../../../../researchTrees/list';
import { getNodeLevel } from '../../../../researchTrees/passiveBonuses';
import type { ResearchNodeDef, ResearchTreeDef } from '../../../../researchTrees/types';

/** Fallback when a node has no `tier` so sort order stays stable. */
export const RESEARCH_NODE_TIER_FALLBACK = 0;

export const RESEARCH_REQUIREMENTS_LABEL = 'Requirements';
export const RESEARCH_REQUIREMENTS_NONE = 'None';
export const RESEARCH_RESOURCES_HEADING = 'Resources';
export const ELIGIBLE_RESEARCH_HEADING = 'Eligible research';
export const POSSESSED_RESEARCH_HEADING = 'Possessed research';
export const UNOWNED_RESEARCH_HEADING = 'Unowned research';
export const RESET_PURCHASED_RESEARCH_LABEL = 'Reset Research';
export const RESET_ADMIN_RESEARCH_LABEL = 'Reset Admin Research';
export const RESET_PURCHASED_RESEARCH_CONFIRM =
    'Reset purchased research? Quest rewards and admin-granted research will be kept.';
export const RESET_ADMIN_RESEARCH_CONFIRM =
    'Reset admin-granted research? Purchased research and quest rewards will be kept.';

export function formatResearchLevelPill(currentLevel: number, maxLevels: number): string {
    return `(${currentLevel}/${maxLevels})`;
}

export interface ResearchRequirementEntry {
    treeId: string;
    nodeId: string;
    title: string;
    possessed: boolean;
}

export interface ResearchGridEntry {
    tree: ResearchTreeDef;
    node: ResearchNodeDef;
}

export function compareResearchNodesByTier(a: ResearchNodeDef, b: ResearchNodeDef): number {
    const tierA = a.tier ?? RESEARCH_NODE_TIER_FALLBACK;
    const tierB = b.tier ?? RESEARCH_NODE_TIER_FALLBACK;
    if (tierA !== tierB) return tierA - tierB;
    if (a.order !== b.order) return a.order - b.order;
    return a.title.localeCompare(b.title);
}

export function researchedSetsByTreeId(
    researchTrees: Record<string, string[]>,
): Record<string, Set<string>> {
    const out: Record<string, Set<string>> = {};
    for (const [treeId, nodeIds] of Object.entries(researchTrees)) {
        out[treeId] = new Set(Array.isArray(nodeIds) ? nodeIds : []);
    }
    return out;
}

/**
 * Structural research prerequisites: same-tree `prereqNodeIds` plus `anyResearched` requirements.
 * Dedupes the same tree/node pair. Account/item/cost requirements are not listed.
 */
export function collectResearchRequirementEntries(
    node: ResearchNodeDef,
    currentTree: ResearchTreeDef,
    researchedByTreeId: Record<string, ReadonlySet<string>>,
): ResearchRequirementEntry[] {
    const entries: ResearchRequirementEntry[] = [];
    const seen = new Set<string>();

    const add = (treeId: string, nodeId: string) => {
        const key = `${treeId}:${nodeId}`;
        if (seen.has(key)) return;
        seen.add(key);
        const def = getResearchNode(treeId, nodeId);
        entries.push({
            treeId,
            nodeId,
            title: def?.title ?? nodeId,
            possessed: researchedByTreeId[treeId]?.has(nodeId) ?? false,
        });
    };

    for (const nodeId of node.prereqNodeIds) {
        add(currentTree.id, nodeId);
    }
    for (const req of node.requirements) {
        if (req.type !== 'anyResearched') continue;
        for (const nodeId of req.nodeIds) {
            add(req.treeId, nodeId);
        }
    }
    return entries;
}

/** Visible requirements line: missing titles only. Overflow truncation is CSS ellipsis. */
export function formatMissingRequirementsLine(entries: ResearchRequirementEntry[]): string {
    const missingTitles = entries.filter((e) => !e.possessed).map((e) => e.title);
    const list = missingTitles.length > 0 ? missingTitles.join(', ') : RESEARCH_REQUIREMENTS_NONE;
    return `${RESEARCH_REQUIREMENTS_LABEL}: ${list}`;
}

function sortResearchGridEntries(entries: ResearchGridEntry[]): ResearchGridEntry[] {
    entries.sort((a, b) => {
        const byTier = compareResearchNodesByTier(a.node, b.node);
        if (byTier !== 0) return byTier;
        return a.tree.title.localeCompare(b.tree.title);
    });
    return entries;
}

export function collectResearchGridEntries(
    availableTrees: ResearchTreeDef[],
    researchTrees: Record<string, string[]>,
    filterTreeId: string | null,
    owned: boolean,
): ResearchGridEntry[] {
    const entries: ResearchGridEntry[] = [];
    for (const tree of availableTrees) {
        if (filterTreeId !== null && tree.id !== filterTreeId) continue;
        const researched = new Set(researchTrees[tree.id] ?? []);
        for (const node of selectableResearchNodes(tree)) {
            if (researched.has(node.id) === owned) {
                entries.push({ tree, node });
            }
        }
    }
    return sortResearchGridEntries(entries);
}

export function researchGridEntryKey(entry: ResearchGridEntry): string {
    return `${entry.tree.id}:${entry.node.id}`;
}

/**
 * Unowned nodes whose prereqs and non-cost requirements are met.
 * Already-purchased nodes (including multi-level) stay in possessed, not here.
 */
export function collectEligibleResearchGridEntries(
    availableTrees: ResearchTreeDef[],
    filterTreeId: string | null,
    ctx: ResearchContext,
): ResearchGridEntry[] {
    const allResearchedNodeIds = collectResearchedNodeIds(ctx.character.researchTrees);
    const researchedByTree = researchedSetsByTreeId(ctx.character.researchTrees ?? {});
    const entries: ResearchGridEntry[] = [];

    for (const tree of availableTrees) {
        if (filterTreeId !== null && tree.id !== filterTreeId) continue;
        const researchedSet = researchedByTree[tree.id] ?? new Set<string>();
        const ctxEffective: ResearchContext = {
            ...ctx,
            campaignResources: computeEffectiveResourcesForTree(tree, ctx),
        };

        for (const node of selectableResearchNodes(tree)) {
            const currentLevel = getNodeLevel(
                tree.id,
                node.id,
                ctx.character.researchTrees,
                ctx.character.researchNodeLevels,
            );
            if (currentLevel > 0) continue;
            if (node.exclusiveWithNodeIds.some((exId) => allResearchedNodeIds.has(exId))) continue;
            if (!node.prereqNodeIds.every((id) => researchedSet.has(id))) continue;
            if (!meetsAll(node.requirements, ctxEffective, researchedByTree)) continue;
            entries.push({ tree, node });
        }
    }
    return sortResearchGridEntries(entries);
}

export function excludeResearchGridEntries(
    entries: ResearchGridEntry[],
    skip: ResearchGridEntry[],
): ResearchGridEntry[] {
    const skipKeys = new Set(skip.map(researchGridEntryKey));
    return entries.filter((entry) => !skipKeys.has(researchGridEntryKey(entry)));
}

/** True when a click would succeed: prereqs, requirements, and next-level cost. */
export function canPurchaseResearchGridEntry(
    entry: ResearchGridEntry,
    ctx: ResearchContext,
    options?: { skipCostCheck?: boolean; skipMissionRewardCheck?: boolean },
): boolean {
    return canResearchNode(entry.tree, entry.node.id, ctx, options).ok;
}
