import type { ResearchRewardSlot, StoryChoiceOptionRow } from './storyTypes';
import type { ResearchNodeDef } from '../../../researchTrees/types';
import {
    isDisabledResearchNode,
    isDraftResearchNode,
    type Requirement,
    type ResearchTreeDef,
} from '../../../researchTrees/types';
import { getCoreFromEquipment } from '../character_defs/items';
import { RESEARCH_TREES } from '../../../researchTrees/list';
import { collectResearchedNodeIds, nodeGrantsEquippedItem } from '../../../researchTrees/evaluator';

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
 * - Specific slot (treeId + nodeId): uses that exact node. Prereqs and exclusivity are
 *   intentionally bypassed — the designer is making a deliberate grant.
 * - Filter slot: picks the first available node matching treeId / tier range that hasn't
 *   been claimed by a prior slot (deterministic, deduped). By default also checks that
 *   all `prereqNodeIds` are satisfied and no `exclusiveWithNodeIds` entry has been
 *   researched, so players only see nodes they could structurally unlock. Set
 *   `respectRequirements: false` on the slot to bypass these structural checks.
 *
 * Both slot types check `node.requirements` (e.g. characterHasEquippedItem, anyResearched).
 * Neither slot type checks costs — mission rewards intentionally bypass cost gating.
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
            // Specific node — no prereq/exclusivity checks (intentional designer grant)
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
        const checkStructural = slot.respectRequirements !== false;
        const candidates: NodeCandidate[] = [];
        const allResearchedNodeIds = collectResearchedNodeIds(researched);
        for (const tree of RESEARCH_TREES) {
            if (slot.treeId && tree.id !== slot.treeId) continue;
            const researchedSet = new Set(researched[tree.id] ?? []);
            for (const node of tree.nodes) {
                if (isDraftResearchNode(node) || isDisabledResearchNode(node)) continue;
                if (researchedSet.has(node.id)) continue;
                if (slot.minTier !== undefined && (node.tier ?? 0) < slot.minTier) continue;
                if (slot.maxTier !== undefined && (node.tier ?? 0) > slot.maxTier) continue;
                if (claimedKeys.has(`${tree.id}:${node.id}`)) continue;
                if (!nodeRequirementsMet(node, equippedSet, researched)) continue;
                if (checkStructural && !nodeStructurallyAvailable(node, researchedSet, allResearchedNodeIds)) continue;
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

function hashSeed(seed: string): number {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed: number): () => number {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Strict requirement check for *random* rewards, which (unlike a designer-specified slot) must only
 * offer what the player could legitimately unlock. Differences from `nodeRequirementsMet`:
 * - `missionReward` nodes (e.g. every alternative Core) are story-specific grants, never random picks;
 * - `characterHasEquippedItem` must really be equipped (no exemption for nodes that grant that item);
 * - requirements we cannot verify here (`accountKnowledge`, `characterHasTrait`) fail closed.
 * `campaignResourceMin` is ignored: like costs, rewards bypass resource gating.
 */
function requirementsStrictlyMet(
    requirements: readonly Requirement[],
    equippedSet: Set<string>,
    equippedItemIds: readonly string[],
    researched: Record<string, string[]>,
): boolean {
    return requirements.every((req) => {
        switch (req.type) {
            case 'missionReward':
                return false;
            case 'characterHasEquippedItem':
                return equippedSet.has(req.itemId);
            case 'characterHasCore':
                return getCoreFromEquipment([...equippedItemIds]) !== null;
            case 'anyResearched':
                return req.nodeIds.some((id) => (researched[req.treeId] ?? []).includes(id));
            case 'notResearched':
                return !(researched[req.treeId] ?? []).includes(req.nodeId);
            case 'campaignResourceMin':
                return true;
            default:
                return false;
        }
    });
}

/** Same gate the Upgrades UI uses: a tree is open once researched in, otherwise its access requirements must hold. */
function treeOpenForRandomReward(
    tree: ResearchTreeDef,
    equippedSet: Set<string>,
    equippedItemIds: readonly string[],
    researched: Record<string, string[]>,
): boolean {
    if ((researched[tree.id] ?? []).length > 0) return true;
    return requirementsStrictlyMet(tree.accessRequirements, equippedSet, equippedItemIds, researched);
}

/**
 * Picks up to `count` distinct research nodes the player could legitimately unlock right now
 * (tree open, unresearched, prereqs met, no exclusive conflicts, requirements strictly met) and
 * returns one reward option per node. Selection is a seeded shuffle of a deterministically sorted
 * pool, so the same `seed` + same research state always yields the same options. Costs are bypassed.
 */
export function pickRandomResearchRewardOptions(
    count: number,
    researchedTrees: Record<string, string[]> | undefined,
    equippedItemIds: readonly string[],
    seed: string,
): StoryChoiceOptionRow[] {
    const researched = researchedTrees ?? {};
    const equippedSet = new Set(equippedItemIds);
    const allResearchedNodeIds = collectResearchedNodeIds(researched);
    const candidates: NodeCandidate[] = [];
    for (const tree of RESEARCH_TREES) {
        if (!treeOpenForRandomReward(tree, equippedSet, equippedItemIds, researched)) continue;
        const researchedSet = new Set(researched[tree.id] ?? []);
        for (const node of tree.nodes) {
            if (isDraftResearchNode(node) || isDisabledResearchNode(node)) continue;
            if (researchedSet.has(node.id)) continue;
            if (!requirementsStrictlyMet(node.requirements, equippedSet, equippedItemIds, researched)) continue;
            if (!nodeStructurallyAvailable(node, researchedSet, allResearchedNodeIds)) continue;
            candidates.push({ treeId: tree.id, node });
        }
    }
    const pool = sortCandidatesDeterministic(candidates);
    const rand = mulberry32(hashSeed(seed));
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool
        .slice(0, count)
        .map((c, index) => buildRow(`random_${index}`, c.treeId, c.node, undefined, undefined));
}

function nodeRequirementsMet(
    node: ResearchNodeDef,
    equippedSet: Set<string>,
    researched: Record<string, string[]>,
): boolean {
    for (const req of node.requirements) {
        if (req.type === 'characterHasEquippedItem') {
            if (nodeGrantsEquippedItem(node, req.itemId)) continue;
            if (!equippedSet.has(req.itemId)) return false;
        }
        if (req.type === 'anyResearched') {
            const researchedSet = new Set(researched[req.treeId] ?? []);
            if (!req.nodeIds.some((id) => researchedSet.has(id))) return false;
        }
        // missionReward is satisfied here — this path is a mission reward grant.
    }
    return true;
}

function nodeStructurallyAvailable(
    node: ResearchNodeDef,
    researchedSet: Set<string>,
    allResearchedNodeIds: Set<string>,
): boolean {
    if (!node.prereqNodeIds.every((id) => researchedSet.has(id))) return false;
    if (node.exclusiveWithNodeIds.some((id) => allResearchedNodeIds.has(id))) return false;
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
