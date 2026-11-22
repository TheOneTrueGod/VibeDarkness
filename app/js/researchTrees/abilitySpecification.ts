/**
 * Resolves which abilities an `AbilitySpecification` names. Pure: reads only the research tree
 * definitions (and, for `tag`, the caller's tag lookup over the unit's abilities).
 */
import { RESEARCH_TREES } from './list';
import { isDisabledResearchNode, isDraftResearchNode, type AbilitySpecification } from './types';

/**
 * Abilities a spec names without needing the unit's abilities: the one id for `abilityId`, the tree's
 * modified abilities for `researchTreeTier`. Returns null for `tag`, which depends on the unit
 * (use {@link resolveSpecifiedAbilityIds}).
 */
export function staticSpecifiedAbilityIds(spec: AbilitySpecification): string[] | null {
    switch (spec.type) {
        case 'abilityId':
            return [spec.abilityId];
        case 'researchTreeTier': {
            const tree = RESEARCH_TREES.find((t) => t.id === spec.treeId);
            if (!tree) return [];
            const minTier = spec.minTier ?? 0;
            const ids: string[] = [];
            for (const node of tree.nodes) {
                if (isDraftResearchNode(node) || isDisabledResearchNode(node)) continue;
                const tier = node.tier ?? 0;
                if (tier < minTier || tier > spec.maxTier) continue;
                const abilityId = node.modifiesAbility?.to;
                if (abilityId && !ids.includes(abilityId)) ids.push(abilityId);
            }
            return ids;
        }
        case 'tag':
            return null;
    }
}

/**
 * Every ability the spec names. `tag` specs match among `unitAbilityIds` via `getTagsForAbility`
 * (both required for tags; without them a tag spec names nothing).
 */
export function resolveSpecifiedAbilityIds(
    spec: AbilitySpecification,
    getTagsForAbility?: (abilityId: string) => readonly string[],
    unitAbilityIds?: readonly string[],
): string[] {
    const fixed = staticSpecifiedAbilityIds(spec);
    if (fixed) return fixed;
    if (spec.type !== 'tag' || !getTagsForAbility || !unitAbilityIds) return [];
    return unitAbilityIds.filter((id) => getTagsForAbility(id).includes(spec.tag));
}
