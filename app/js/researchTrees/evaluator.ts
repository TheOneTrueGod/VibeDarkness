import type { AccountState, CampaignResources } from '../types';
import type { CampaignCharacter } from '../games/minion_battles/character_defs/CampaignCharacter';
import { fromCampaignCharacterData } from '../games/minion_battles/character_defs/CampaignCharacter';
import { getCoreFromEquipment, getItemDef } from '../games/minion_battles/character_defs/items';
import type { ResearchTreeDef, ResearchNodeDef, Requirement, CampaignResourceCost, CampaignResourceKey, ResearchEffect, AbilityModifier, ResearchNodeLevels } from './types';
import { RESEARCH_TREES } from './list';
import { getNodeLevel, getNodeMaxLevels } from './passiveBonuses';

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

export function multiplyCost(cost: CampaignResourceCost, times: number): CampaignResourceCost {
    if (times <= 1) return { ...cost };
    const out: CampaignResourceCost = {};
    for (const [k, v] of Object.entries(cost ?? {})) {
        const key = k as CampaignResourceKey;
        out[key] = (v ?? 0) * times;
    }
    return out;
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

/** Sum researched-node costs, multiplying each leveled node's cost by its purchased level. */
export function sumResearchedCosts(
    tree: ResearchTreeDef,
    researchTrees: Record<string, string[]> | undefined,
    researchNodeLevels: ResearchNodeLevels | undefined,
): CampaignResourceCost {
    const out: CampaignResourceCost = {};
    for (const node of tree.nodes) {
        const level = getNodeLevel(tree.id, node.id, researchTrees, researchNodeLevels);
        if (level <= 0) continue;
        const scaled = multiplyCost(node.cost ?? {}, level);
        for (const [k, v] of Object.entries(scaled)) {
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
    const costs = sumResearchedCosts(tree, ctx.character.researchTrees, ctx.character.researchNodeLevels);
    return subtractCosts(ctx.campaignResources, costs);
}

export function canResearchNode(tree: ResearchTreeDef, nodeId: string, ctx: ResearchContext, options: { skipCostCheck?: boolean } = {}): { ok: boolean; missing: string[] } {
    const byId = nodeById(tree);
    const node = byId[nodeId];
    if (!node) return { ok: false, missing: ['unknown_node'] };

    const researchedForTree = getResearchedSet(ctx.character, tree.id);
    const researched: Record<string, Set<string>> = Object.fromEntries(
        Object.entries(ctx.character.researchTrees ?? {}).map(([tid, ids]) => [tid, new Set(ids)]),
    );
    const currentLevel = getNodeLevel(
        tree.id,
        nodeId,
        ctx.character.researchTrees,
        ctx.character.researchNodeLevels,
    );
    const maxLevels = getNodeMaxLevels(node);

    // Already at max level — cannot research further.
    if (currentLevel >= maxLevels) {
        return { ok: false, missing: ['already_researched'] };
    }

    // Leveling an already-unlocked node: only check one more level of cost + node requirements.
    const isLevelUp = currentLevel > 0;

    const closureIds = isLevelUp ? [nodeId] : prereqClosure(tree, nodeId);
    const closureNodes = closureIds.map((id) => byId[id]).filter(Boolean) as ResearchNodeDef[];
    const neededNodes = isLevelUp
        ? [node]
        : closureNodes.filter((n) => !researchedForTree.has(n.id));

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

    // Cost must be affordable with effective resources.
    // First unlock may include prereq nodes; level-ups only pay this node's cost once.
    if (!options.skipCostCheck) {
        const costTotal = isLevelUp ? (node.cost ?? {}) : sumCosts(neededNodes);
        for (const [k, v] of Object.entries(costTotal)) {
            const key = k as CampaignResourceKey;
            if ((effective[key] ?? 0) < (v ?? 0)) {
                return { ok: false, missing: [`insufficient_${key}`] };
            }
        }
    }

    return { ok: true, missing: [] };
}

export function applyResearchEffects(tree: ResearchTreeDef, ctx: ResearchContext): { equipment: string[]; extraEquippedItemIds: string[] } {
    const researchedSet = getResearchedSet(ctx.character, tree.id);
    const researchedNodes = sortNodesDeterministic(tree.nodes.filter((n) => researchedSet.has(n.id)));

    let equipment = [...ctx.character.equipment];
    const extraEquippedItemIds: string[] = [];

    const applyEffect = (effect: ResearchEffect, overrideCurrentEquipment: boolean) => {
        if (effect.type === 'equipItem') {
            const newDef = getItemDef(effect.itemId);
            const newSlots = new Set(newDef?.slots ?? []);
            if (overrideCurrentEquipment && newSlots.size > 0) {
                equipment = equipment.filter((id) => {
                    const def = getItemDef(id);
                    return !def?.slots.some((s) => newSlots.has(s));
                });
            }
            if (!equipment.includes(effect.itemId)) equipment.push(effect.itemId);
        } else if (effect.type === 'replaceEquippedItem') {
            const hasFrom = equipment.includes(effect.fromItemId);
            if (hasFrom) {
                equipment = equipment.filter((id) => id !== effect.fromItemId);
                if (!equipment.includes(effect.toItemId)) equipment.push(effect.toItemId);
            }
        } else if (effect.type === 'addExtraCardsFromItem') {
            // Implemented by duplicating the item id into extraEquippedItemIds; the ability
            // assembly loop in BaseMissionDef treats extra items the same as equipped items.
            if (equipment.includes(effect.itemId)) {
                for (let i = 0; i < effect.count; i++) {
                    extraEquippedItemIds.push(effect.itemId);
                }
            }
        }
    };

    for (const node of researchedNodes) {
        for (const eff of node.effects) {
            applyEffect(eff, node.overrideCurrentEquipment ?? false);
        }
    }

    return { equipment, extraEquippedItemIds };
}

/**
 * Returns card IDs to add directly to the unit's ability list from `addCard` effects in researched nodes.
 * Applied after equipment-based abilities are collected when building the battle deck.
 */
export function getDirectCardsFromResearch(
    researchTrees: Record<string, string[]> | undefined,
): string[] {
    const trees = researchTrees ?? {};
    const cards: string[] = [];
    for (const tree of RESEARCH_TREES) {
        const researchedSet = new Set(trees[tree.id] ?? []);
        const researchedNodes = sortNodesDeterministic(tree.nodes.filter((n) => researchedSet.has(n.id)));
        for (const node of researchedNodes) {
            for (const eff of node.effects) {
                if (eff.type === 'addCard' && !cards.includes(eff.cardId)) {
                    cards.push(eff.cardId);
                }
            }
        }
    }
    return cards;
}

/**
 * Returns card IDs to strip from the unit's assembled ability list from `removeCard` effects
 * in researched nodes. Applied after equipment/addCard cards are collected, before replaceCard.
 */
export function getRemovedCardsFromResearch(
    researchTrees: Record<string, string[]> | undefined,
): Set<string> {
    const trees = researchTrees ?? {};
    const cardIds = new Set<string>();
    for (const tree of RESEARCH_TREES) {
        const researchedSet = new Set(trees[tree.id] ?? []);
        const researchedNodes = sortNodesDeterministic(tree.nodes.filter((n) => researchedSet.has(n.id)));
        for (const node of researchedNodes) {
            for (const eff of node.effects) {
                if (eff.type === 'removeCard') {
                    cardIds.add(eff.cardId);
                }
            }
        }
    }
    return cardIds;
}

/**
 * Returns pet IDs granted by `grantPet` effects in researched nodes across all trees.
 * Call pre-battle to determine which pets to spawn alongside the player.
 */
export function getPetsFromResearch(
    researchTrees: Record<string, string[]> | undefined,
): string[] {
    const trees = researchTrees ?? {};
    const petIds: string[] = [];
    for (const tree of RESEARCH_TREES) {
        const researchedSet = new Set(trees[tree.id] ?? []);
        const researchedNodes = sortNodesDeterministic(tree.nodes.filter((n) => researchedSet.has(n.id)));
        for (const node of researchedNodes) {
            for (const eff of node.effects) {
                if (eff.type === 'grantPet' && !petIds.includes(eff.petId)) {
                    petIds.push(eff.petId);
                }
            }
        }
    }
    return petIds;
}

/**
 * Returns extra ability IDs granted to each pet kind by `grantPetAbility` research effects.
 * Merged into the pet's spawn ability list in BaseMissionDef (does not replace petDef.abilityIds).
 */
export function getPetAbilitiesFromResearch(
    researchTrees: Record<string, string[]> | undefined,
): Map<string, string[]> {
    const trees = researchTrees ?? {};
    const byPet = new Map<string, string[]>();
    for (const tree of RESEARCH_TREES) {
        const researchedSet = new Set(trees[tree.id] ?? []);
        const researchedNodes = sortNodesDeterministic(tree.nodes.filter((n) => researchedSet.has(n.id)));
        for (const node of researchedNodes) {
            for (const eff of node.effects) {
                if (eff.type !== 'grantPetAbility') continue;
                const list = byPet.get(eff.petId) ?? [];
                if (!list.includes(eff.abilityId)) {
                    list.push(eff.abilityId);
                }
                byPet.set(eff.petId, list);
            }
        }
    }
    return byPet;
}

/**
 * Returns battle-resource starting amounts from `grantMissionStartResource` effects.
 * Amounts for the same resourceId are summed across all researched nodes.
 */
export function getMissionStartResourcesFromResearch(
    researchTrees: Record<string, string[]> | undefined,
): Map<string, number> {
    const trees = researchTrees ?? {};
    const amounts = new Map<string, number>();
    for (const tree of RESEARCH_TREES) {
        const researchedSet = new Set(trees[tree.id] ?? []);
        const researchedNodes = sortNodesDeterministic(tree.nodes.filter((n) => researchedSet.has(n.id)));
        for (const node of researchedNodes) {
            for (const eff of node.effects) {
                if (eff.type === 'grantMissionStartResource') {
                    amounts.set(
                        eff.resourceId,
                        (amounts.get(eff.resourceId) ?? 0) + eff.amount,
                    );
                }
            }
        }
    }
    return amounts;
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
 * Returns nodes the character has not yet fully researched and are structurally available:
 * all prereqNodeIds are satisfied, no exclusive node has been researched, and all
 * research-state requirements (anyResearched / notResearched) pass. External
 * requirements (accountKnowledge, equipment, costs) are ignored — no context needed.
 *
 * Multi-level nodes remain available until their purchased level reaches `levels`.
 *
 * @param researchedTrees  researchTrees map from CampaignCharacter
 * @param options.treeId   optional: restrict to one tree
 * @param options.tier     optional: restrict to one display tier
 * @param options.researchNodeLevels  optional: level counts for multi-level nodes
 */
export function getAvailableResearchNodes(
    researchedTrees: Record<string, string[]> | undefined,
    options: { treeId?: string; tier?: number; researchNodeLevels?: ResearchNodeLevels } = {},
): ResearchNodeDef[] {
    const { treeId, tier, researchNodeLevels } = options;
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
            const currentLevel = getNodeLevel(tree.id, node.id, trees, researchNodeLevels);
            const maxLevels = getNodeMaxLevels(node);
            if (currentLevel >= maxLevels) continue;
            if (tier !== undefined && node.tier !== tier) continue;

            if (node.exclusiveWithNodeIds.some((exId) => researchedSet.has(exId))) continue;
            // Prereqs only required for first unlock; level-ups skip prereq re-check beyond presence
            if (currentLevel === 0 && !node.prereqNodeIds.every((prereqId) => researchedSet.has(prereqId))) {
                continue;
            }

            const researchReqsMet = node.requirements.every((req) => {
                if (req.type === 'anyResearched') {
                    const set = allResearched[req.treeId] ?? new Set<string>();
                    return req.nodeIds.some((nid) => set.has(nid));
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

function mergeModifierInto(entry: AbilityModifier, modifier: AbilityModifier): void {
    if (modifier.damageFlat !== undefined) entry.damageFlat = (entry.damageFlat ?? 0) + modifier.damageFlat;
    if (modifier.maxUsesFlat !== undefined) entry.maxUsesFlat = (entry.maxUsesFlat ?? 0) + modifier.maxUsesFlat;
    if (modifier.explosionDamageFlat !== undefined) entry.explosionDamageFlat = (entry.explosionDamageFlat ?? 0) + modifier.explosionDamageFlat;
    if (modifier.addTags?.length) {
        const existing = entry.addTags ? [...entry.addTags] : [];
        for (const tag of modifier.addTags) {
            if (!existing.includes(tag)) existing.push(tag);
        }
        entry.addTags = existing;
    }
    if (modifier.healPenaltyPctOverride !== undefined) {
        entry.healPenaltyPctOverride = entry.healPenaltyPctOverride !== undefined
            ? Math.min(entry.healPenaltyPctOverride, modifier.healPenaltyPctOverride)
            : modifier.healPenaltyPctOverride;
    }
}

/**
 * Computes per-ability modifiers from all researched nodes across all trees.
 * Values from multiple nodes are merged additively. Call once at unit creation and store
 * the result on the unit — research does not change mid-battle.
 *
 * @param getTagsForAbility  Optional: maps abilityId → tags. Required to resolve tag-based specs.
 * @param unitAbilityIds     Optional: the unit's ability IDs. Required to resolve tag-based specs.
 */
export function computeAbilityModifiersFromResearch(
    researchTrees: Record<string, string[]> | undefined,
    getTagsForAbility?: (abilityId: string) => readonly string[],
    unitAbilityIds?: string[],
): Record<string, AbilityModifier> {
    const trees = researchTrees ?? {};
    const result: Record<string, AbilityModifier> = {};
    for (const tree of RESEARCH_TREES) {
        const researchedSet = new Set(trees[tree.id] ?? []);
        const researchedNodes = sortNodesDeterministic(tree.nodes.filter((n) => researchedSet.has(n.id)));
        for (const node of researchedNodes) {
            for (const modifier of node.abilityResearchModifiers ?? []) {
                const spec = modifier.abilitySpecification;
                if (spec.type === 'abilityId') {
                    const entry = result[spec.abilityId] ?? (result[spec.abilityId] = {});
                    mergeModifierInto(entry, modifier);
                } else if (spec.type === 'tag' && getTagsForAbility && unitAbilityIds) {
                    for (const abilityId of unitAbilityIds) {
                        if (getTagsForAbility(abilityId).includes(spec.tag)) {
                            const entry = result[abilityId] ?? (result[abilityId] = {});
                            mergeModifierInto(entry, modifier);
                        }
                    }
                }
            }
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
            campaignResources: { food: 0, metal: 0, population: 0, crystals: 0 },
        };
        const applied = applyResearchEffects(tree, ctx);
        equipment = applied.equipment;
        extraEquippedItemIds.push(...applied.extraEquippedItemIds);
    }
    return { equipmentIds: equipment, extraEquippedItemIds };
}

