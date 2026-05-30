import type { ResearchRewardSlot, StoryChoiceOptionRow } from './storyTypes';
import type { ResearchNodeDef } from '../../../researchTrees/types';
import { RESEARCH_TREES } from '../../../researchTrees/list';

interface NodeCandidate {
    treeId: string;
    node: ResearchNodeDef;
}

function sortCandidatesDeterministic(candidates: NodeCandidate[]): NodeCandidate[] {
    return [...candidates].sort((a, b) => {
        if (a.node.order !== b.node.order) return a.node.order - b.node.order;
        return a.node.id.localeCompare(b.node.id);
    });
}

/**
 * Resolves a `researchRewardSlots` config into `StoryChoiceOptionRow[]`.
 *
 * Each slot becomes one option presented to the player:
 * - Specific slot (treeId + nodeId): uses that exact node.
 * - Filter slot: picks the first available node matching treeId / tier range
 *   that hasn't been claimed by a prior slot (deterministic, deduped).
 *
 * Filtering checks: not already researched, characterHasEquippedItem requirements met.
 * Does NOT check prereqs or exclusivity — mission rewards intentionally bypass these.
 */
export function resolveResearchRewardSlots(
    slots: ResearchRewardSlot[],
    researchedTrees: Record<string, string[]> | undefined,
    equippedItemIds: readonly string[],
): StoryChoiceOptionRow[] {
    const researched = researchedTrees ?? {};
    const equippedSet = new Set(equippedItemIds);
    const claimedKeys = new Set<string>(); // "treeId:nodeId"

    return slots.map((slot, index) => {
        const id = `slot_${index}`;

        if ('nodeId' in slot && slot.nodeId !== undefined) {
            // Specific node
            const tree = RESEARCH_TREES.find((t) => t.id === slot.treeId);
            const node = tree?.nodes.find((n) => n.id === slot.nodeId);
            if (!node) {
                return {
                    id,
                    label: slot.loreTitle ?? 'Unknown',
                    loreTitle: slot.loreTitle,
                    loreDescription: slot.loreDescription,
                    action: { type: 'grant_research_to_player' as const, treeId: slot.treeId, nodeId: slot.nodeId },
                    disabledLabel: 'Research node not found.',
                };
            }
            claimedKeys.add(`${slot.treeId}:${slot.nodeId}`);
            return buildRow(id, slot.treeId, node, slot.loreTitle, slot.loreDescription);
        }

        // Filter slot — collect candidates across all trees
        const candidates: NodeCandidate[] = [];
        for (const tree of RESEARCH_TREES) {
            if (slot.treeId && tree.id !== slot.treeId) continue;
            const researchedSet = new Set(researched[tree.id] ?? []);
            for (const node of tree.nodes) {
                if (researchedSet.has(node.id)) continue;
                if (slot.minTier !== undefined && (node.tier ?? 0) < slot.minTier) continue;
                if (slot.maxTier !== undefined && (node.tier ?? 0) > slot.maxTier) continue;
                if (claimedKeys.has(`${tree.id}:${node.id}`)) continue;
                if (!nodeRequirementsMet(node, equippedSet, researched)) continue;
                candidates.push({ treeId: tree.id, node });
            }
        }

        const sorted = sortCandidatesDeterministic(candidates);
        const picked = sorted[0];

        if (!picked) {
            return {
                id,
                label: slot.loreTitle ?? 'No research available',
                loreTitle: slot.loreTitle,
                loreDescription: slot.loreDescription,
                action: { type: 'grant_research_to_player' as const, treeId: '', nodeId: '__unavailable__' },
                disabledLabel: 'No matching research available for your current equipment.',
            };
        }

        claimedKeys.add(`${picked.treeId}:${picked.node.id}`);
        return buildRow(id, picked.treeId, picked.node, slot.loreTitle, slot.loreDescription);
    });
}

function nodeRequirementsMet(
    node: ResearchNodeDef,
    equippedSet: Set<string>,
    researched: Record<string, string[]>,
): boolean {
    for (const req of node.requirements) {
        if (req.type === 'characterHasEquippedItem' && !equippedSet.has(req.itemId)) return false;
        if (req.type === 'anyResearched') {
            const researchedSet = new Set(researched[req.treeId] ?? []);
            if (!req.nodeIds.some((id) => researchedSet.has(id))) return false;
        }
    }
    return true;
}

function buildRow(
    id: string,
    treeId: string,
    node: ResearchNodeDef,
    loreTitle: string | undefined,
    loreDescription: string | undefined,
): StoryChoiceOptionRow {
    return {
        id,
        label: loreTitle ?? node.title,
        loreTitle: loreTitle ?? node.title,
        loreDescription: loreDescription ?? node.flavorText ?? node.description,
        action: { type: 'grant_research_to_player', treeId, nodeId: node.id },
    };
}
