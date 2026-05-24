import type { AccountState, CampaignResources } from '../types';
import type { CampaignCharacter } from '../games/minion_battles/character_defs/CampaignCharacter';
import { fromCampaignCharacterData } from '../games/minion_battles/character_defs/CampaignCharacter';
import { getCoreFromEquipment } from '../games/minion_battles/character_defs/items';
import type { ResearchTreeDef, ResearchNodeDef, Requirement, CampaignResourceCost, CampaignResourceKey, ResearchEffect } from './types';
import { RESEARCH_TREES } from './list';

export interface ResearchContext {
    account: AccountState;
    character: CampaignCharacter;
    campaignResources: CampaignResources;
}

export function getResearchedSet(character: CampaignCharacter, treeId: string): Set<string> {
    const ids = character.researchTrees?.[treeId] ?? [];
    return new Set(Array.isArray(ids) ? ids : []);
}

export function treeHasAnyResearch(character: CampaignCharacter, treeId: string): boolean {
    return (character.researchTrees?.[treeId] ?? []).length > 0;
}

export function nodeById(tree: ResearchTreeDef): Record<string, ResearchNodeDef> {
    const map: Record<string, ResearchNodeDef> = {};
    for (const n of tree.nodes) {
        map[n.id] = n;
    }
    return map;
}

export function sumCosts(nodes: ResearchNodeDef[]): CampaignResourceCost {
    const out: CampaignResourceCost = {};
    for (const n of nodes) {
        for (const [k, v] of Object.entries(n.cost ?? {})) {
            const key = k as CampaignResourceKey;
            out[key] = (out[key] ?? 0) + (v ?? 0);
        }
    }
    return out;
}

export function subtractCosts(resources: CampaignResources, costs: CampaignResourceCost): CampaignResources {
    const out: CampaignResources = { ...resources };
    for (const [k, v] of Object.entries(costs)) {
        const key = k as CampaignResourceKey;
        out[key] = (out[key] ?? 0) - (v ?? 0);
    }
    return out;
}

export function meetsRequirement(req: Requirement, ctx: ResearchContext, researched: Record<string, Set<string>>): boolean {
    switch (req.type) {
        case 'accountKnowledge':
            return !!ctx.account.knowledge?.[req.key];
        case 'campaignResourceMin':
            return (ctx.campaignResources[req.resource] ?? 0) >= req.min;
        case 'characterHasEquippedItem':
            return ctx.character.equipment.includes(req.itemId);
        case 'characterHasCore':
            return getCoreFromEquipment(ctx.character.equipment) !== null;
        case 'characterHasTrait':
            return ctx.character.traits.includes(req.trait);
        case 'anyResearched': {
            const set = researched[req.treeId] ?? new Set<string>();
            return req.nodeIds.some((nodeId) => set.has(nodeId));
        }
        case 'notResearched': {
            const set = researched[req.treeId] ?? new Set<string>();
            return !set.has(req.nodeId);
        }
        default:
            return false;
    }
}

export function meetsAll(requirements: Requirement[], ctx: ResearchContext, researched: Record<string, Set<string>>): boolean {
    for (const req of requirements) {
        if (!meetsRequirement(req, ctx, researched)) return false;
    }
    return true;
}

export function prereqClosure(tree: ResearchTreeDef, nodeId: string): string[] {
    const byId = nodeById(tree);
    const out: string[] = [];
    const seen = new Set<string>();

    const visit = (id: string) => {
        if (seen.has(id)) return;
        seen.add(id);
        const n = byId[id];
        if (!n) return;
        for (const p of n.prereqNodeIds) visit(p);
        out.push(id);
    };

    visit(nodeId);
    return out;
}

export function sortNodesDeterministic(nodes: ResearchNodeDef[]): ResearchNodeDef[] {
    return [...nodes].sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.id.localeCompare(b.id);
    });
}

export function computeEffectiveResourcesForTree(tree: ResearchTreeDef, ctx: ResearchContext): CampaignResources {
    const researchedSet = getResearchedSet(ctx.character, tree.id);
    const researchedNodes = tree.nodes.filter((n) => researchedSet.has(n.id));
    const costs = sumCosts(researchedNodes);
    return subtractCosts(ctx.campaignResources, costs);
}

export function canResearchNode(tree: ResearchTreeDef, nodeId: string, ctx: ResearchContext): { ok: boolean; missing: string[] } {
    const byId = nodeById(tree);
    const node = byId[nodeId];
    if (!node) return { ok: false, missing: ['unknown_node'] };

    const researchedForTree = getResearchedSet(ctx.character, tree.id);
    const researched: Record<string, Set<string>> = { [tree.id]: researchedForTree };

    const closureIds = prereqClosure(tree, nodeId);
    const closureNodes = closureIds.map((id) => byId[id]).filter(Boolean) as ResearchNodeDef[];
    const neededNodes = closureNodes.filter((n) => !researchedForTree.has(n.id));

    // exclusivity checks (only for nodes being researched now or already researched)
    const allWillBeResearched = new Set<string>([...closureIds, ...Array.from(researchedForTree)]);
    for (const n of closureNodes) {
        for (const ex of n.exclusiveWithNodeIds) {
            if (allWillBeResearched.has(ex)) {
                return { ok: false, missing: ['exclusive_conflict'] };
            }
        }
    }

    // Requirements: treat campaignResourceMin against effective resources (after already-researched)
    const effective = computeEffectiveResourcesForTree(tree, ctx);
    const ctxEffective: ResearchContext = { ...ctx, campaignResources: effective };

    // Requirements must hold for each node to be researched (and the target node)
    for (const n of neededNodes) {
        if (!meetsAll(n.requirements, ctxEffective, researched)) {
            return { ok: false, missing: ['requirements_not_met'] };
        }
    }

    // Cost must be affordable with effective resources, considering prerequisites being added in this action
    const costTotal = sumCosts(neededNodes);
    for (const [k, v] of Object.entries(costTotal)) {
        const key = k as CampaignResourceKey;
        if ((effective[key] ?? 0) < (v ?? 0)) {
            return { ok: false, missing: [`insufficient_${key}`] };
        }
    }

    return { ok: true, missing: [] };
}

export function applyResearchEffects(tree: ResearchTreeDef, ctx: ResearchContext): { equipment: string[]; extraEquippedItemIds: string[] } {
    const researchedSet = getResearchedSet(ctx.character, tree.id);
    const researchedNodes = sortNodesDeterministic(tree.nodes.filter((n) => researchedSet.has(n.id)));

    let equipment = [...ctx.character.equipment];
    const extraEquippedItemIds: string[] = [];

    const applyEffect = (effect: ResearchEffect) => {
        if (effect.type === 'replaceEquippedItem') {
            const hasFrom = equipment.includes(effect.fromItemId);
            if (hasFrom) {
                equipment = equipment.filter((id) => id !== effect.fromItemId);
                if (!equipment.includes(effect.toItemId)) equipment.push(effect.toItemId);
            }
        } else if (effect.type === 'addExtraCardsFromItem') {
            // For now: implement by duplicating the equipped item id into extraEquippedItemIds,
            // and have deck building call character.getBattleCards(extraEquippedItemIds).
            // The item itself is the source of cards, so duplicating it duplicates its cards.
            if (equipment.includes(effect.itemId)) {
                for (let i = 0; i < effect.count; i++) {
                    extraEquippedItemIds.push(effect.itemId);
                }
            }
        }
    };

    for (const node of researchedNodes) {
        for (const eff of node.effects) {
            applyEffect(eff);
        }
    }

    return { equipment, extraEquippedItemIds };
}

/**
 * Returns a map of cardId → replacement cardId based on all `replaceCard` effects in researched nodes.
 * Applied after equipment is resolved when building the battle deck.
 */
export function getCardReplacementsFromResearch(
    researchTrees: Record<string, string[]> | undefined,
): Map<string, string> {
    const trees = researchTrees ?? {};
    const replacements = new Map<string, string>();
    for (const tree of RESEARCH_TREES) {
        const researchedSet = new Set(trees[tree.id] ?? []);
        const researchedNodes = sortNodesDeterministic(tree.nodes.filter((n) => researchedSet.has(n.id)));
        for (const node of researchedNodes) {
            for (const eff of node.effects) {
                if (eff.type === 'replaceCard') {
                    replacements.set(eff.fromCardId, eff.toCardId);
                }
            }
        }
    }
    return replacements;
}

/**
 * Returns nodes the character has not yet researched and are structurally available:
 * all prereqNodeIds are satisfied, no exclusive node has been researched, and all
 * research-state requirements (anyResearched / notResearched) pass. External
 * requirements (accountKnowledge, equipment, costs) are ignored — no context needed.
 *
 * @param researchedTrees  researchTrees map from CampaignCharacter
 * @param options.treeId   optional: restrict to one tree
 * @param options.tier     optional: restrict to one display tier
 */
export function getAvailableResearchNodes(
    researchedTrees: Record<string, string[]> | undefined,
    options: { treeId?: string; tier?: number } = {},
): ResearchNodeDef[] {
    const { treeId, tier } = options;
    const trees = researchedTrees ?? {};

    const treesToSearch = treeId
        ? RESEARCH_TREES.filter((t) => t.id === treeId)
        : RESEARCH_TREES;

    const allResearched: Record<string, Set<string>> = {};
    for (const tree of RESEARCH_TREES) {
        allResearched[tree.id] = new Set(trees[tree.id] ?? []);
    }

    const result: ResearchNodeDef[] = [];

    for (const tree of treesToSearch) {
        const researchedSet = allResearched[tree.id];

        for (const node of tree.nodes) {
            if (researchedSet.has(node.id)) continue;
            if (tier !== undefined && node.tier !== tier) continue;

            if (node.exclusiveWithNodeIds.some((exId) => researchedSet.has(exId))) continue;
            if (!node.prereqNodeIds.every((prereqId) => researchedSet.has(prereqId))) continue;

            const researchReqsMet = node.requirements.every((req) => {
                if (req.type === 'anyResearched') {
                    const set = allResearched[req.treeId] ?? new Set<string>();
                    return req.nodeIds.some((nodeId) => set.has(nodeId));
                }
                if (req.type === 'notResearched') {
                    const set = allResearched[req.treeId] ?? new Set<string>();
                    return !set.has(req.nodeId);
                }
                return true;
            });
            if (!researchReqsMet) continue;

            result.push(node);
        }
    }

    return result;
}

/**
 * Applies all trees' deterministic equipment mutations (matches Character Editor layered research effects).
 * Use when building battle deck item lists from persisted equipment plus `researchTrees`.
 */
export function mergeBattleEquipmentIdsFromResearch(
    equipmentIds: string[],
    researchTrees: Record<string, string[]> | undefined,
): { equipmentIds: string[]; extraEquippedItemIds: string[] } {
    const trees = researchTrees ?? {};
    let equipment = [...equipmentIds];
    const extraEquippedItemIds: string[] = [];
    const dummyAccount = { id: 0, name: '', role: 'user' as const, fire: 0, water: 0, earth: 0, air: 0 };
    for (const tree of RESEARCH_TREES) {
        const character = fromCampaignCharacterData({
            id: '__research_merge',
            equipment,
            knowledge: {},
            traits: [],
            portraitId: '',
            battleChipDetails: {},
            campaignId: '',
            missionId: '',
            researchTrees: trees,
        });
        const ctx: ResearchContext = {
            account: dummyAccount as AccountState,
            character,
            campaignResources: {},
        };
        const applied = applyResearchEffects(tree, ctx);
        equipment = applied.equipment;
        extraEquippedItemIds.push(...applied.extraEquippedItemIds);
    }
    return { equipmentIds: equipment, extraEquippedItemIds };
}

