import {
    ADMIN_RESEARCH_CHECK_OPTIONS,
    canAdminGrantResearchNode,
    canResearchNode,
    collectResearchedNodeIds,
    computeEffectiveResourcesForTree,
    meetsAll,
    selectableResearchNodes,
    type CanResearchNodeOptions,
    type ResearchContext,
} from '../../../../researchTrees/evaluator';
import { getResearchNode } from '../../../../researchTrees/list';
import { getNodeLevel } from '../../../../researchTrees/passiveBonuses';
import { ResearchSource, type ResearchNodeDef, type ResearchTreeDef } from '../../../../researchTrees/types';

/** Fallback when a node has no `tier` so sort order stays stable. */
export const RESEARCH_NODE_TIER_FALLBACK = 0;

export const RESEARCH_REQUIREMENTS_LABEL = 'Requirements';
export const RESEARCH_REQUIREMENTS_NONE = 'None';
/** Joins titles inside an `anyResearched` OR clause. */
export const RESEARCH_REQUIREMENT_OR_WORD = 'or';
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

export interface ResearchRequirementOption {
    treeId: string;
    nodeId: string;
    title: string;
    possessed: boolean;
}

/** One AND requirement, or one `anyResearched` OR group. */
export interface ResearchRequirementEntry {
    options: ResearchRequirementOption[];
    satisfied: boolean;
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

function researchRequirementOption(
    treeId: string,
    nodeId: string,
    researchedByTreeId: Record<string, ReadonlySet<string>>,
): ResearchRequirementOption {
    const def = getResearchNode(treeId, nodeId);
    return {
        treeId,
        nodeId,
        title: def?.title ?? nodeId,
        possessed: researchedByTreeId[treeId]?.has(nodeId) ?? false,
    };
}

function researchRequirementClause(options: ResearchRequirementOption[]): ResearchRequirementEntry {
    return {
        options,
        satisfied: options.some((option) => option.possessed),
    };
}

export function formatRequirementClauseLabel(entry: ResearchRequirementEntry): string {
    const titles = entry.options.map((option) => option.title);
    if (titles.length <= 1) return titles[0] ?? '';
    return `(${titles.join(` ${RESEARCH_REQUIREMENT_OR_WORD} `)})`;
}

/**
 * Structural research prerequisites: same-tree `prereqNodeIds` plus `anyResearched` requirements.
 * Multi-node `anyResearched` is one OR clause. Dedupes a single node already listed as a prereq.
 * Account/item/cost requirements are not listed.
 */
export function collectResearchRequirementEntries(
    node: ResearchNodeDef,
    currentTree: ResearchTreeDef,
    researchedByTreeId: Record<string, ReadonlySet<string>>,
): ResearchRequirementEntry[] {
    const clauses: ResearchRequirementEntry[] = [];
    const seenSingle = new Set<string>();

    const addSingle = (treeId: string, nodeId: string) => {
        const key = `${treeId}:${nodeId}`;
        if (seenSingle.has(key)) return;
        seenSingle.add(key);
        clauses.push(researchRequirementClause([
            researchRequirementOption(treeId, nodeId, researchedByTreeId),
        ]));
    };

    for (const nodeId of node.prereqNodeIds) {
        addSingle(currentTree.id, nodeId);
    }
    for (const req of node.requirements) {
        if (req.type !== 'anyResearched') continue;
        if (req.nodeIds.length === 1) {
            addSingle(req.treeId, req.nodeIds[0]!);
            continue;
        }
        clauses.push(researchRequirementClause(
            req.nodeIds.map((nodeId) => researchRequirementOption(req.treeId, nodeId, researchedByTreeId)),
        ));
    }
    return clauses;
}

/** Visible requirements line: unsatisfied clauses only. Overflow truncation is CSS ellipsis. */
export function formatMissingRequirementsLine(entries: ResearchRequirementEntry[]): string {
    const missingLabels = entries
        .filter((entry) => !entry.satisfied)
        .map((entry) => formatRequirementClauseLabel(entry));
    const list = missingLabels.length > 0 ? missingLabels.join(', ') : RESEARCH_REQUIREMENTS_NONE;
    return `${RESEARCH_REQUIREMENTS_LABEL}: ${list}`;
}

/** True when any listed research clause is still unsatisfied. */
export function hasUnmetResearchRequirements(entries: ResearchRequirementEntry[]): boolean {
    return entries.some((entry) => !entry.satisfied);
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
    includeDisabled = false,
): ResearchGridEntry[] {
    const entries: ResearchGridEntry[] = [];
    for (const tree of availableTrees) {
        if (filterTreeId !== null && tree.id !== filterTreeId) continue;
        const researched = new Set(researchTrees[tree.id] ?? []);
        for (const node of selectableResearchNodes(tree, { includeDisabled })) {
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
    includeDisabled = false,
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

        for (const node of selectableResearchNodes(tree, { includeDisabled })) {
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
    options?: CanResearchNodeOptions,
): boolean {
    return canResearchNode(entry.tree, entry.node.id, ctx, options).ok;
}

export const RESEARCH_CLICK_PURCHASE = 'purchase' as const;
export const RESEARCH_CLICK_ADMIN = 'admin' as const;
export type ResearchNodeClickAction = typeof RESEARCH_CLICK_PURCHASE | typeof RESEARCH_CLICK_ADMIN;

export type ResearchNodeClickHandler = (treeId: string, nodeId: string, asAdmin?: boolean) => void;

/** Player purchase vs admin Shift+click grant. Shift is ignored for non-admins. */
export function resolveResearchNodeClick(input: {
    shiftKey: boolean;
    isAdmin: boolean;
    playerCanPurchase: boolean;
    adminCanGrant: boolean;
}): ResearchNodeClickAction | null {
    if (input.isAdmin && input.shiftKey) {
        return input.adminCanGrant ? RESEARCH_CLICK_ADMIN : null;
    }
    return input.playerCanPurchase ? RESEARCH_CLICK_PURCHASE : null;
}

export function researchSourceForClick(action: ResearchNodeClickAction): ResearchSource {
    return action === RESEARCH_CLICK_ADMIN ? ResearchSource.Admin : ResearchSource.Purchased;
}

export function canResearchOptionsForClick(action: ResearchNodeClickAction): CanResearchNodeOptions {
    return action === RESEARCH_CLICK_ADMIN ? ADMIN_RESEARCH_CHECK_OPTIONS : {};
}

export function researchNodeClickEligibility(
    tree: ResearchTreeDef,
    nodeId: string,
    ctx: ResearchContext,
    isAdmin: boolean,
): { playerCanPurchase: boolean; adminCanGrant: boolean; playerMissing: string[] } {
    const playerCheck = canResearchNode(tree, nodeId, ctx);
    const adminCheck = isAdmin
        ? canAdminGrantResearchNode(tree, nodeId, ctx)
        : playerCheck;
    return {
        playerCanPurchase: playerCheck.ok,
        adminCanGrant: adminCheck.ok,
        playerMissing: playerCheck.missing,
    };
}

export function researchNodeClickHandler(args: {
    isAdmin: boolean;
    playerCanPurchase: boolean;
    adminCanGrant: boolean;
    onResearchNode: ResearchNodeClickHandler;
    treeId: string;
    nodeId: string;
}): (event: { shiftKey: boolean }) => void {
    return (event) => {
        const action = resolveResearchNodeClick({
            shiftKey: event.shiftKey,
            isAdmin: args.isAdmin,
            playerCanPurchase: args.playerCanPurchase,
            adminCanGrant: args.adminCanGrant,
        });
        if (action === RESEARCH_CLICK_ADMIN) {
            args.onResearchNode(args.treeId, args.nodeId, true);
            return;
        }
        if (action === RESEARCH_CLICK_PURCHASE) {
            args.onResearchNode(args.treeId, args.nodeId, false);
        }
    };
}
