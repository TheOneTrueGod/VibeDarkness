import { DEFAULT_RESEARCH_NODE_LEVELS, getNodeLevel } from './passiveBonuses';
import { ResearchSource, type ResearchNodeLevels, type ResearchNodeSources } from './types';

const VALID_RESEARCH_SOURCES = new Set<string>(Object.values(ResearchSource));

export function isResearchSource(value: unknown): value is ResearchSource {
    return typeof value === 'string' && VALID_RESEARCH_SOURCES.has(value);
}

function parseSourceList(raw: unknown): ResearchSource[] {
    if (isResearchSource(raw)) return [raw];
    if (!Array.isArray(raw)) return [];
    const out: ResearchSource[] = [];
    for (const entry of raw) {
        if (isResearchSource(entry)) out.push(entry);
    }
    return out;
}

export function normalizeResearchSources(raw: ResearchNodeSources | undefined): ResearchNodeSources {
    if (!raw || typeof raw !== 'object') return {};
    const out: ResearchNodeSources = {};
    for (const [treeId, nodes] of Object.entries(raw)) {
        if (!treeId || !nodes || typeof nodes !== 'object') continue;
        const treeOut: Record<string, ResearchSource[]> = {};
        for (const [nodeId, sources] of Object.entries(nodes)) {
            if (!nodeId) continue;
            const list = parseSourceList(sources);
            if (list.length > 0) treeOut[nodeId] = list;
        }
        if (Object.keys(treeOut).length > 0) out[treeId] = treeOut;
    }
    return out;
}

/** Sources for each owned level; missing legacy data counts as Purchased. */
export function getNodeResearchSources(
    treeId: string,
    nodeId: string,
    researchTrees: Record<string, string[]> | undefined,
    researchNodeLevels: ResearchNodeLevels | undefined,
    researchSources: ResearchNodeSources | undefined,
): ResearchSource[] {
    const level = getNodeLevel(treeId, nodeId, researchTrees, researchNodeLevels);
    if (level <= 0) return [];
    const stored = researchSources?.[treeId]?.[nodeId];
    const list = stored ? [...stored] : [];
    while (list.length < level) list.push(ResearchSource.Purchased);
    if (list.length > level) list.length = level;
    return list;
}

/** Joins distinct sources for the admin card footer. */
export const RESEARCH_SOURCE_LABEL_JOIN = ', ';

export function formatResearchSourcesLabel(sources: readonly ResearchSource[]): string {
    const unique: ResearchSource[] = [];
    for (const source of sources) {
        if (!unique.includes(source)) unique.push(source);
    }
    return unique.join(RESEARCH_SOURCE_LABEL_JOIN);
}

export function formatOwnedResearchSourcesLabel(
    treeId: string,
    nodeId: string,
    researchTrees: Record<string, string[]> | undefined,
    researchNodeLevels: ResearchNodeLevels | undefined,
    researchSources: ResearchNodeSources | undefined,
): string {
    return formatResearchSourcesLabel(
        getNodeResearchSources(treeId, nodeId, researchTrees, researchNodeLevels, researchSources),
    );
}

export function countResearchSourceLevels(sources: readonly ResearchSource[], source: ResearchSource): number {
    let count = 0;
    for (const entry of sources) {
        if (entry === source) count += 1;
    }
    return count;
}

export function hasResearchOfSource(
    researchTrees: Record<string, string[]> | undefined,
    researchNodeLevels: ResearchNodeLevels | undefined,
    researchSources: ResearchNodeSources | undefined,
    source: ResearchSource,
): boolean {
    for (const [treeId, nodeIds] of Object.entries(researchTrees ?? {})) {
        for (const nodeId of nodeIds ?? []) {
            const list = getNodeResearchSources(treeId, nodeId, researchTrees, researchNodeLevels, researchSources);
            if (countResearchSourceLevels(list, source) > 0) return true;
        }
    }
    return false;
}

export interface StrippedResearchState {
    researchTrees: Record<string, string[]>;
    researchNodeLevels: ResearchNodeLevels;
    researchSources: ResearchNodeSources;
    /** Fully removed node ids, keyed by tree. */
    removedNodeIdsByTree: Record<string, string[]>;
}

/** Drop every level with `sourceToRemove`. Remaining levels keep their sources. */
export function stripResearchBySource(
    researchTrees: Record<string, string[]>,
    researchNodeLevels: ResearchNodeLevels | undefined,
    researchSources: ResearchNodeSources | undefined,
    sourceToRemove: ResearchSource,
    treeIds?: readonly string[],
): StrippedResearchState {
    const treeFilter = treeIds != null ? new Set(treeIds) : null;
    const nextTrees: Record<string, string[]> = {};
    const nextLevels: ResearchNodeLevels = {};
    const nextSources: ResearchNodeSources = {};
    const removedNodeIdsByTree: Record<string, string[]> = {};

    for (const [treeId, nodeIds] of Object.entries(researchTrees)) {
        if (treeFilter && !treeFilter.has(treeId)) {
            nextTrees[treeId] = [...(nodeIds ?? [])];
            if (researchNodeLevels?.[treeId]) nextLevels[treeId] = { ...researchNodeLevels[treeId] };
            if (researchSources?.[treeId]) nextSources[treeId] = { ...researchSources[treeId] };
            continue;
        }
        const keptIds: string[] = [];
        const treeLevels: Record<string, number> = {};
        const treeSources: Record<string, ResearchSource[]> = {};
        const removed: string[] = [];
        for (const nodeId of nodeIds ?? []) {
            const list = getNodeResearchSources(
                treeId,
                nodeId,
                researchTrees,
                researchNodeLevels,
                researchSources,
            );
            const kept = list.filter((entry) => entry !== sourceToRemove);
            if (kept.length === 0) {
                removed.push(nodeId);
                continue;
            }
            keptIds.push(nodeId);
            if (kept.length !== DEFAULT_RESEARCH_NODE_LEVELS || researchNodeLevels?.[treeId]?.[nodeId] != null) {
                treeLevels[nodeId] = kept.length;
            }
            treeSources[nodeId] = kept;
        }
        nextTrees[treeId] = keptIds;
        if (Object.keys(treeLevels).length > 0) nextLevels[treeId] = treeLevels;
        if (Object.keys(treeSources).length > 0) nextSources[treeId] = treeSources;
        if (removed.length > 0) removedNodeIdsByTree[treeId] = removed;
    }

    return {
        researchTrees: nextTrees,
        researchNodeLevels: nextLevels,
        researchSources: nextSources,
        removedNodeIdsByTree,
    };
}
