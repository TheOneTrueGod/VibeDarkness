import { getItemDef } from '../games/minion_battles/character_defs/items';
import { isDisabledResearchNode, isDraftResearchNode, type ResearchTreeDef } from './types';

/** Abilities the tree owns outright: `ownedAbilityIds` plus the cards of its access items. */
function ownedBaseAbilityIds(tree: ResearchTreeDef): Set<string> {
    const ids = new Set<string>(tree.ownedAbilityIds ?? []);
    for (const req of tree.accessRequirements) {
        if (req.type !== 'characterHasEquippedItem') continue;
        const item = getItemDef(req.itemId);
        for (const cardId of item?.cardsToAdd ?? []) ids.add(cardId);
    }
    return ids;
}

/**
 * Ability IDs this tree owns (`ownedAbilityIds`, required items) or upgrades from them.
 * Cross-tree synergies (e.g. Earth modifying throw_rock) are excluded so a
 * rocks loadout does not surface the Earth tree.
 */
export function collectResearchTreeAbilityIds(tree: ResearchTreeDef): Set<string> {
    const ids = new Set<string>();
    const fromItems = ownedBaseAbilityIds(tree);

    for (const node of tree.nodes) {
        if (isDraftResearchNode(node) || isDisabledResearchNode(node)) continue;
        for (const effect of node.effects) {
            if (effect.type === 'addCard') ids.add(effect.cardId);
            if (effect.type === 'replaceCard') ids.add(effect.toCardId);
            if (effect.type === 'grantPetAbility') ids.add(effect.abilityId);
        }
    }

    const isOwned = (abilityId: string) => fromItems.has(abilityId) || ids.has(abilityId);

    for (const node of tree.nodes) {
        if (isDraftResearchNode(node) || isDisabledResearchNode(node)) continue;
        for (const effect of node.effects) {
            if (effect.type === 'replaceCard' && isOwned(effect.fromCardId)) {
                ids.add(effect.fromCardId);
            }
        }
        const modified = node.modifiesAbility;
        if (modified && isOwned(modified.from)) {
            ids.add(modified.from);
            ids.add(modified.to);
        }
        for (const mod of node.abilityResearchModifiers ?? []) {
            if (mod.abilitySpecification.type !== 'abilityId') continue;
            const abilityId = mod.abilitySpecification.abilityId;
            if (isOwned(abilityId)) ids.add(abilityId);
        }
    }

    return ids;
}

export function researchTreeMatchesAbilityIds(
    tree: ResearchTreeDef,
    playerAbilityIds: ReadonlySet<string>,
): boolean {
    if (playerAbilityIds.size === 0) return false;
    for (const abilityId of collectResearchTreeAbilityIds(tree)) {
        if (playerAbilityIds.has(abilityId)) return true;
    }
    return false;
}

function treeHasResearchedNodes(
    researchedTrees: Record<string, string[]> | undefined,
    treeId: string,
): boolean {
    return (researchedTrees?.[treeId] ?? []).length > 0;
}

/** True when the tree has a player-facing node besides its virtual root. */
export function researchTreeHasNonRootNodes(tree: ResearchTreeDef): boolean {
    return tree.nodes.some(
        (n) => n.id !== tree.boundItem?.rootNodeId && !isDraftResearchNode(n) && !isDisabledResearchNode(n),
    );
}

/**
 * Players see trees they have abilities in, or that they have already researched. Bound
 * (equipment) trees with nothing but their root are hidden: admins still list them, dimmed.
 */
export function isPlayerVisibleResearchTree(
    tree: ResearchTreeDef,
    researchedTrees: Record<string, string[]> | undefined,
    playerAbilityIds: ReadonlySet<string>,
): boolean {
    if (tree.boundItem && !researchTreeHasNonRootNodes(tree)) return false;
    return researchTreeMatchesAbilityIds(tree, playerAbilityIds) || treeHasResearchedNodes(researchedTrees, tree.id);
}

/**
 * Equipment-tagged trees go after all other trees; within each group, matching trees come first.
 * Original order is preserved within each sub-group (stable sort).
 */
export function sortResearchTreesByPlayerAbilities<T extends ResearchTreeDef>(
    trees: readonly T[],
    playerAbilityIds: ReadonlySet<string>,
): T[] {
    const rank = (t: T) =>
        (t.tags?.includes('equipment') ? 2 : 0) + (researchTreeMatchesAbilityIds(t, playerAbilityIds) ? 0 : 1);
    return [...trees].sort((a, b) => rank(a) - rank(b));
}
