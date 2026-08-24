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
    | { type: 'removeCard'; cardId: string }
    | { type: 'grantPet'; petId: string }
    /** Grant an extra ability id to a pet kind at mission start (merged into spawn ability list). */
    | { type: 'grantPetAbility'; petId: string; abilityId: string }
    | { type: 'grantMissionStartResource'; resourceId: string; amount: number };

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
    /** Multiplier applied to the ability's lingering duration (e.g. Gravity Locus field). Merged by product. */
    durationMult?: number;
    /** Knockback tier granted or raised on this ability (take max when merging). */
    knockbackTier?: number;
    /** Tags to add to this ability for this unit (e.g. 'Entombed'). String to avoid circular imports — use AbilityTag values. */
    addTags?: readonly string[];
    /** Max casts per Combo Cancel chain (research-granted, e.g. Rapid Throw). */
    comboMax?: number;
    /** Overrides DEFAULT_HEAL_PENALTY_PCT for this ability's heals, down to 0 for "no penalty". */
    healPenaltyPctOverride?: number;
}

/** Goes on a research node — specifies which ability to target and what to change. */
export interface AbilityResearchModifier extends AbilityModifier {
    abilitySpecification: AbilitySpecification;
}

/**
 * Passive research stat keys.
 * Ability-specific flat damage uses `ability_<abilityId>_damage`
 * (e.g. Ability0701Damage = 'ability_0701_damage' for Dog Bite).
 */
export enum PassiveStatKey {
    MaxHealth = 'maxHealth',
    AllDamage = 'all_damage',
    EarthDamage = 'earth_damage',
    PetMaxHealth = 'pet_maxHealth',
    Ability0701Damage = 'ability_0701_damage',
    MaxMovementPoints = 'maxMovementPoints',
    MovementRegenPerRound = 'movementRegenPerRound',
}

/** Per-stat add/mult contribution from a passive node (totals at max level). */
export interface PassiveBonusEntry {
    add?: number;
    mult?: number;
}

/** Map of passive stat → add/mult granted at full node levels. */
export type PassiveBonusMap = Partial<Record<PassiveStatKey, PassiveBonusEntry>>;

/**
 * Aggregated passive bonuses for a character (computed at mission start / Stat Bonuses tab).
 * `add` values are summed across nodes; `mult` is `1 + sum(nodeMult - 1)` across nodes.
 */
export type PassiveBonuses = Partial<Record<PassiveStatKey, { add: number; mult: number }>>;

/** Per-tree map of nodeId → purchased level for multi-level (passive) nodes. */
export type ResearchNodeLevels = Record<string, Record<string, number>>;

export interface ResearchNodeDef {
    id: string;
    title: string;
    description: string;
    flavorText?: string;
    /** Stable ordering used for deterministic application. Lower applies first. */
    order: number;
    /** Display tier shown in the research tree view (1 = base, 2 = first upgrade, etc.). */
    tier?: number;
    /**
     * When true, this node is work-in-progress: hidden from research selection UI and
     * excluded from available-node / mission-reward discovery.
     */
    draft?: boolean;
    position: { x: number; y: number };
    prereqNodeIds: string[];
    exclusiveWithNodeIds: string[];
    requirements: Requirement[];
    cost: CampaignResourceCost;
    /**
     * When true, each purchase costs `cost` multiplied by the target level (currentLevel + 1).
     * E.g. base `{ metal: 5 }` at level 0 → 5 metal; level 1 → 10 metal for the next rank.
     */
    purchaseCostMultipliesByTargetLevel?: boolean;
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
    /**
     * Max purchasable levels for this node. Omit or `1` = binary unlock.
     * Passive nodes with `passiveBonus` typically set this &gt; 1.
     */
    levels?: number;
    /**
     * Max passive bonuses granted at full `levels`. Contribution scales with current level:
     * `floor(add * L / Max)` and `(mult - 1) * L / Max`.
     */
    passiveBonus?: PassiveBonusMap;
}

/** True when the node is WIP and must not appear in research selection / discovery. */
export function isDraftResearchNode(node: Pick<ResearchNodeDef, 'draft'>): boolean {
    return node.draft === true;
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

