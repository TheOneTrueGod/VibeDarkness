export type { CampaignResourceKey } from '../types';
import type { CampaignResourceKey } from '../types';

export type CampaignResourceCost = Partial<Record<CampaignResourceKey, number>>;

export type Requirement =
    | { type: 'accountKnowledge'; key: string }
    | { type: 'campaignResourceMin'; resource: CampaignResourceKey; min: number }
    | { type: 'characterHasEquippedItem'; itemId: string }
    | { type: 'characterHasCore' }
    | { type: 'characterHasTrait'; trait: string }
    | { type: 'anyResearched'; treeId: string; nodeIds: string[] }
    | { type: 'notResearched'; treeId: string; nodeId: string };

export type ResearchEffect =
    | { type: 'equipItem'; itemId: string }
    | { type: 'replaceEquippedItem'; fromItemId: string; toItemId: string }
    | { type: 'addExtraCardsFromItem'; itemId: string; cardId: string; count: number }
    | { type: 'replaceCard'; fromCardId: string; toCardId: string }
    | { type: 'addCard'; cardId: string }
    | { type: 'grantPet'; petId: string };

/**
 * Specifies which abilities a modifier targets.
 * tag: applies to all abilities in the unit's deck that carry that tag (string to avoid circular imports — use AbilityTag values).
 */
export type AbilitySpecification =
    | { type: 'abilityId'; abilityId: string }
    | { type: 'tag'; tag: string };

/** Aggregated per-ability modifier passed to ability logic at runtime. */
export interface AbilityModifier {
    damageFlat?: number;
    maxUsesFlat?: number;
    /** Flat bonus added to explosion/AOE damage (e.g. throw_charged_rock splash). */
    explosionDamageFlat?: number;
    /** Tags to add to this ability for this unit (e.g. 'Entombed'). String to avoid circular imports — use AbilityTag values. */
    addTags?: readonly string[];
    /** Overrides DEFAULT_HEAL_PENALTY_PCT for this ability's heals, down to 0 for "no penalty". */
    healPenaltyPctOverride?: number;
}

/** Goes on a research node — specifies which ability to target and what to change. */
export interface AbilityResearchModifier extends AbilityModifier {
    abilitySpecification: AbilitySpecification;
}

export interface ResearchNodeDef {
    id: string;
    title: string;
    description: string;
    flavorText?: string;
    /** Stable ordering used for deterministic application. Lower applies first. */
    order: number;
    /** Display tier shown in the research tree view (1 = base, 2 = first upgrade, etc.). */
    tier?: number;
    position: { x: number; y: number };
    prereqNodeIds: string[];
    exclusiveWithNodeIds: string[];
    requirements: Requirement[];
    cost: CampaignResourceCost;
    effects: ResearchEffect[];
    /** Ability parameter modifications granted by this node. Merged additively across all researched nodes. */
    abilityResearchModifiers?: AbilityResearchModifier[];
    /**
     * When true, `equipItem` effects on this node replace any conflicting same-slot items
     * instead of skipping. Use for starting-weapon nodes where research defines the item.
     */
    overrideCurrentEquipment?: boolean;
    /**
     * Ability IDs to show a before/after card preview in the tooltip.
     * Use the same ID for both when the node modifies rather than replaces an ability.
     */
    modifiesAbility?: { from: string; to: string };
}

/** A node from another tree shown inside this tree's panel. Purchasing stores it under fromTreeId. */
export interface CrossTreeNodeRef {
    fromTreeId: string;
    nodeId: string;
    position: { x: number; y: number };
}

export interface ResearchTreeDef {
    id: string;
    title: string;
    /** Tree-level requirements to show/allow (unless it has any node researched). */
    accessRequirements: Requirement[];
    nodes: ResearchNodeDef[];
    /** Nodes owned by other trees that are also displayed in this tree's panel. */
    crossTreeNodeRefs?: CrossTreeNodeRef[];
}

