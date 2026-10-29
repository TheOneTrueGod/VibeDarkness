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
    | { type: 'notResearched'; treeId: string; nodeId: string }
    /** Only grantable as a quest/mission reward — not purchasable on Upgrades. */
    | { type: 'missionReward' };

export const MISSION_REWARD_REQUIREMENT: Requirement = { type: 'missionReward' };

/** Player-facing label for `{ type: 'missionReward' }`. */
export const MISSION_REWARD_REQUIREMENT_LABEL = 'Mission reward';

/** `canResearchNode` missing key when a node is mission-reward-only. */
export const MISSION_REWARD_MISSING = 'mission_reward';

/** `canResearchNode` missing key when a node is disabled for non-admins. */
export const DISABLED_RESEARCH_MISSING = 'disabled_node';

export type ResearchEffect =
    /**
     * CORE-ONLY: swaps an equipped core item (e.g. BasicCore → EarthCore) when the node is researched.
     * Research never grants or swaps weapons; weapon trees change abilities via `replaceCard` / `addCard`.
     */
    | { type: 'replaceEquippedItem'; fromItemId: string; toItemId: string }
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
    /** Uses restored at the start of each round (capped at max uses), on top of the ability's own recoveries. */
    roundRecoveryFlat?: number;
    /** Flat bonus added to explosion/AOE damage (e.g. throw_charged_rock splash). */
    explosionDamageFlat?: number;
    /** Multiplier applied to the ability's lingering duration (e.g. Gravity Locus field). Merged by product. */
    durationMult?: number;
    /** Multiplier applied to the ability's reach / cone outer radius. Merged by product. */
    rangeMult?: number;
    /** Knockback tier granted or raised on this ability (take max when merging). */
    knockbackTier?: number;
    /** Tags to add to this ability for this unit (e.g. 'Entombed'). String to avoid circular imports — use AbilityTag values. */
    addTags?: readonly string[];
    /** Max casts per Combo Cancel chain (research-granted, e.g. Rapid Throw). */
    comboMax?: number;
    /** Flat bonus added to resources this ability grants (e.g. Gather Light). */
    resourceGainFlat?: number;
    /** Flat bonus added to this ability's primary resource cost. */
    resourceCostFlat?: number;
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
    /** Maximum Hunger a campaign character can store. */
    MaxHunger = 'maxHunger',
    AllDamage = 'all_damage',
    EarthDamage = 'earth_damage',
    PetMaxHealth = 'pet_maxHealth',
    Ability0701Damage = 'ability_0701_damage',
    MaxMovementPoints = 'maxMovementPoints',
    MovementRegenPerRound = 'movementRegenPerRound',
    /** Presence (add > 0) unlocks Light's tile-based per-round recovery. */
    LightRegenEnabled = 'lightRegenEnabled',
    /** Darkness upgrade: flat max health added to enemy slimes (`enemy_unit_<characterId>_<stat>`). */
    EnemyUnitSlimeMaxHealthBonus = 'enemy_unit_slime_max_health_bonus',
    /** Darkness upgrade: extra wedge projectiles fired by enemy slimes. */
    EnemyUnitSlimeExtraProjectiles = 'enemy_unit_slime_extra_projectiles',
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

/** How a character obtained a research node (or one of its levels). */
export enum ResearchSource {
    Purchased = 'Purchased',
    Admin = 'Admin',
    QuestReward = 'QuestReward',
}

/** Per-tree map of nodeId → source of each owned level (index 0 = level 1). */
export type ResearchNodeSources = Record<string, Record<string, ResearchSource[]>>;

export interface ResearchNodeDef {
    id: string;
    title: string;
    description: string;
    flavorText?: string;
    /** One-line plain summary (e.g. hover text for Darkness Upgrade reward cards). */
    summary?: string;
    /** Stable ordering used for deterministic application. Lower applies first. */
    order: number;
    /** Display tier shown in the research tree view (1 = base, 2 = first upgrade, etc.). */
    tier?: number;
    /**
     * When true, this node is work-in-progress: hidden from research selection UI and
     * excluded from available-node / mission-reward discovery.
     */
    draft?: boolean;
    /**
     * When true, hidden from non-admins (Upgrades graph/grid and discovery).
     * Admins still see the node and can grant it.
     */
    disabled?: boolean;
    /** Extra tags for this node, added to its tree's tags (see {@link ResearchTag}). */
    tags?: ResearchTag[];
    /**
     * Free "virtual" root of a weapon: counts as researched automatically while any of these
     * items is equipped, and is never persisted. Nodes that depend on it (through `prereqNodeIds`
     * or a same-tree `anyResearched` requirement) are only active while it is.
     * Read the ids through {@link getVirtualRootItemIds}.
     */
    virtualRootFor?: string | readonly string[];
    /** Graph position. Ignored (and may be omitted) when the tree uses `layout: 'rows'`. */
    position?: { x: number; y: number };
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
     * Optional hint when a node changes an ability in a way the effects do not describe
     * (no `replaceCard`, `addCard`, or `abilityResearchModifiers`). The hover preview
     * derives grants, replacements, and stat diffs on its own; this pair is only the
     * fallback card. Same id both sides means "this ability changes", not a new card.
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
    /**
     * Extra resources granted at the end of a victorious mission while this node is active
     * (darkness upgrades). Scaled per level for levelled nodes.
     */
    bonusRewards?: Partial<Record<CampaignResourceKey, number>>;
}

/** Tags of a node: its tree's tags plus any it declares itself. */
export function getResearchNodeTags(
    tree: Pick<ResearchTreeDef, 'tags'>,
    node: Pick<ResearchNodeDef, 'tags'>,
): ResearchTag[] {
    return [...new Set([...(tree.tags ?? []), ...(node.tags ?? [])])];
}

/** True when the node is WIP and must not appear in research selection / discovery. */
export function isDraftResearchNode(node: Pick<ResearchNodeDef, 'draft'>): boolean {
    return node.draft === true;
}

/** True when the node is admin-only (hidden from players). */
export function isDisabledResearchNode(node: Pick<ResearchNodeDef, 'disabled'>): boolean {
    return node.disabled === true;
}

/** A node from another tree shown inside this tree's panel. Purchasing stores it under fromTreeId. */
export interface CrossTreeNodeRef {
    fromTreeId: string;
    nodeId: string;
    position: { x: number; y: number };
}

/**
 * Category tags used to target research (e.g. campsite reward slots).
 * - `weapon`: weapon upgrades (Throw Rock, Swing Mace, Raise Shield and everything in their trees)
 * - `stat`: stat upgrades (the Training tree)
 * - `core`: trees tied to a core item (Light, Earth, Command, Gravity, Blood Mage)
 * - `equipment`: trees whose nodes are bound to equipment (the Weapons tree); listed after all other trees in the Upgrades sidebar
 */
export type ResearchTag = 'weapon' | 'stat' | 'core' | 'equipment';

/** Item ids that make this node a virtual root (empty for ordinary nodes). */
export function getVirtualRootItemIds(node: Pick<ResearchNodeDef, 'virtualRootFor'>): readonly string[] {
    const ids = node.virtualRootFor;
    if (ids == null) return [];
    return typeof ids === 'string' ? [ids] : ids;
}

/** True when the node is a free virtual root (see `ResearchNodeDef.virtualRootFor`). */
export function isVirtualRootNode(node: Pick<ResearchNodeDef, 'virtualRootFor'>): boolean {
    return getVirtualRootItemIds(node).length > 0;
}

/** True when the tree holds equipment-bound virtual roots (the Weapons tree). */
export function hasVirtualRootNodes(tree: Pick<ResearchTreeDef, 'nodes'>): boolean {
    return tree.nodes.some(isVirtualRootNode);
}

export interface ResearchTreeDef {
    id: string;
    title: string;
    /** Border / accent colour for this tree's cards and sidebar row. */
    colour: string;
    /** Small icon shown on this tree's cards and sidebar row. */
    icon: string;
    /** Tree-level requirements to show/allow (unless it has any node researched). */
    accessRequirements: Requirement[];
    /** Tags inherited by every node in this tree (see {@link ResearchTag}). */
    tags?: ResearchTag[];
    /**
     * Abilities this tree owns without needing an access item (e.g. Training owns Punch). Used to
     * show and sort trees by the player's abilities; see `collectResearchTreeAbilityIds`.
     */
    ownedAbilityIds?: string[];
    nodes: ResearchNodeDef[];
    /**
     * How the Upgrades tree view places nodes. `'graph'` (default) uses each node's `position`;
     * `'rows'` gives every virtual root its own row with its upgrades stretching to the right
     * (see `researchTreeLayout.ts`).
     */
    layout?: 'graph' | 'rows';
    /** Nodes owned by other trees that are also displayed in this tree's panel. */
    crossTreeNodeRefs?: CrossTreeNodeRef[];
}

