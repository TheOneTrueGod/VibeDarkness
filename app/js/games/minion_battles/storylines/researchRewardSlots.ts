import type { ResearchRewardSlot, StoryChoiceOptionRow } from './storyTypes';
import type { EquipmentSlotType } from '../character_defs/items/types';
import type { ResearchNodeDef, ResearchNodeLevels } from '../../../researchTrees/types';
import {
    isDisabledResearchNode,
    isDraftResearchNode,
    isVirtualRootNode,
    type Requirement,
    type ResearchTreeDef,
    getResearchNodeTags,
} from '../../../researchTrees/types';
import { getCoreFromEquipment } from '../character_defs/items';
import { getItemUpgradesFor } from '../character_defs/items/itemUpgrades';
import { RESEARCH_TREES } from '../../../researchTrees/list';
import { collectResearchedNodeIds, nodeGrantsEquippedItem } from '../../../researchTrees/evaluator';
import {
    getActiveResearchNodeLevels,
    getActiveResearchTrees,
    getInactiveResearchNodeIds,
} from '../../../researchTrees/activeResearch';
import { canLevelUpNode } from '../../../researchTrees/passiveBonuses';

/** Player data the strict (random-slot) checks need beyond research and equipment. */
export interface ResearchRewardContext {
    /** The player's account knowledge keys; without it `accountKnowledge` requirements fail closed. */
    accountKnowledge?: Record<string, unknown>;
    /** Stored levels of multi-level nodes; a researched node stays offerable until it is maxed. */
    researchNodeLevels?: ResearchNodeLevels;
}

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
 * - Filter slots may also require a `tag` (see `ResearchTag`). With `random: true` the slot picks a
 *   seeded-random candidate (seed = `randomSeed` + slot index, so the same state gives the same
 *   offer) and uses the strict eligibility rules (`requirementsStrictlyMet`, `treeOpenForRandomReward`).
 *
 * - `{ kind: 'equipmentUpgrade' }` slots become `equip_item` rows for upgrades of equipped items (no research),
 *   omitted when the player has no upgrade left to offer.
 *
 * Non-random slots check `node.requirements` loosely (e.g. characterHasEquippedItem, anyResearched).
 * No slot type checks costs — mission rewards intentionally bypass cost gating.
 *
 * Filter slots offer a researched multi-level node (e.g. Healthy) again until it reaches its max level
 * (from `context.researchNodeLevels`); granting it adds one level.
 */
export function resolveResearchRewardSlots(
    slots: ResearchRewardSlot[],
    researchedTrees: Record<string, string[]> | undefined,
    equippedItemIds: readonly string[],
    randomSeed = '',
    context: ResearchRewardContext = {},
): StoryChoiceOptionRow[] {
    // Active research: inactive bound (weapon) trees dropped, virtual roots of active ones added.
    // Idempotent, so callers may pass either stored or already-active research.
    const researched = getActiveResearchTrees(researchedTrees ?? {}, equippedItemIds);
    const researchNodeLevels = getActiveResearchNodeLevels(context.researchNodeLevels ?? {}, equippedItemIds);
    const strict: StrictContext = {
        equippedSet: new Set(equippedItemIds),
        equippedItemIds,
        researched,
        accountKnowledge: context.accountKnowledge,
    };
    const claimedKeys = new Set<string>(); // "treeId:nodeId"

    const claimedUpgradeIds = new Set<string>();

    return slots.flatMap((slot, index): StoryChoiceOptionRow[] => {
        const id = `slot_${index}`;

        if (slot.kind === 'equipmentUpgrade') {
            const row = resolveEquipmentUpgradeRow(id, slot.slot, equippedItemIds, claimedUpgradeIds);
            return row ? [row] : [];
        }

        return [resolveNodeSlot(slot, index, id)];
    });

    function resolveNodeSlot(
        slot: Exclude<ResearchRewardSlot, { kind: 'equipmentUpgrade' }>,
        index: number,
        id: string,
    ): StoryChoiceOptionRow {
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
            if (slot.random && !treeOpenForRandomReward(tree, strict)) continue;
            const researchedSet = new Set(researched[tree.id] ?? []);
            // Weapon nodes whose weapon is not equipped are closed to random rewards, even if stored.
            const inactive = slot.random ? getInactiveResearchNodeIds(tree, strict.equippedItemIds) : new Set<string>();
            for (const node of tree.nodes) {
                if (isDraftResearchNode(node) || isDisabledResearchNode(node)) continue;
                // Virtual roots come from equipment, never from rewards.
                if (isVirtualRootNode(node) || inactive.has(node.id)) continue;
                if (researchedSet.has(node.id) && !canLevelUpNode(node, tree.id, researched, researchNodeLevels)) continue;
                if (slot.tag && !getResearchNodeTags(tree, node).includes(slot.tag)) continue;
                if (slot.minTier !== undefined && (node.tier ?? 0) < slot.minTier) continue;
                if (slot.maxTier !== undefined && (node.tier ?? 0) > slot.maxTier) continue;
                if (claimedKeys.has(`${tree.id}:${node.id}`)) continue;
                const requirementsMet = slot.random
                    ? requirementsStrictlyMet(node.requirements, strict)
                    : nodeRequirementsMet(node, strict.equippedSet, researched);
                if (!requirementsMet) continue;
                if ((slot.random || checkStructural) && !nodeStructurallyAvailable(node, researchedSet, allResearchedNodeIds)) continue;
                candidates.push({ treeId: tree.id, node });
            }
        }

        const sorted = sortCandidatesDeterministic(candidates);
        const picked = slot.random
            ? sorted[Math.floor(mulberry32(hashSeed(`${randomSeed}:${index}`))() * sorted.length)]
            : sorted[0];

        if (!picked) {
            return {
                id,
                label: slot.loreTitle ?? (slot.tag ? `No ${slot.tag} research available` : 'No research available'),
                loreTitle: slot.loreTitle,
                loreDescription: slot.loreDescription,
                action: { type: 'grant_research_to_player' as const, treeId: '', nodeId: '__unavailable__' },
                disabledLabel: 'No matching research available for your current equipment.',
            };
        }

        claimedKeys.add(`${picked.treeId}:${picked.node.id}`);
        return buildRow(id, picked.treeId, picked.node, slot.loreTitle, slot.loreDescription);
    }
}

/**
 * The next unclaimed upgrade of an equipped item as an `equip_item` row, or null when none is left.
 * Upgrades follow equipped-item order, then registry order, so the offer is deterministic.
 */
function resolveEquipmentUpgradeRow(
    id: string,
    slot: EquipmentSlotType | undefined,
    equippedItemIds: readonly string[],
    claimedUpgradeIds: Set<string>,
): StoryChoiceOptionRow | null {
    for (const equippedId of equippedItemIds) {
        for (const upgrade of getItemUpgradesFor(equippedId)) {
            if (claimedUpgradeIds.has(upgrade.id)) continue;
            if (slot && !upgrade.slots.includes(slot)) continue;
            claimedUpgradeIds.add(upgrade.id);
            return {
                id,
                label: upgrade.name,
                loreTitle: upgrade.name,
                loreDescription: upgrade.description,
                action: { type: 'equip_item', itemId: upgrade.id },
            };
        }
    }
    return null;
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
 * - `accountKnowledge` needs the caller's `accountKnowledge`, and fails closed without it;
 * - requirements we cannot verify here (`characterHasTrait`) fail closed.
 * `campaignResourceMin` is ignored: like costs, rewards bypass resource gating.
 */
interface StrictContext {
    equippedSet: Set<string>;
    equippedItemIds: readonly string[];
    researched: Record<string, string[]>;
    accountKnowledge: Record<string, unknown> | undefined;
}

function requirementsStrictlyMet(requirements: readonly Requirement[], ctx: StrictContext): boolean {
    const { equippedSet, equippedItemIds, researched, accountKnowledge } = ctx;
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
            case 'accountKnowledge':
                return !!accountKnowledge?.[req.key];
            default:
                return false;
        }
    });
}

/** Same gate the Upgrades UI uses: a tree is open once researched in, otherwise its access requirements must hold. */
function treeOpenForRandomReward(tree: ResearchTreeDef, ctx: StrictContext): boolean {
    if ((ctx.researched[tree.id] ?? []).length > 0) return true;
    return requirementsStrictlyMet(tree.accessRequirements, ctx);
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
