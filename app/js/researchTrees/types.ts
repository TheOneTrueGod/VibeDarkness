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
    | { type: 'replaceCard'; fromCardId: string; toCardId: string };

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

export interface ResearchTreeDef {
    id: string;
    title: string;
    /** Tree-level requirements to show/allow (unless it has any node researched). */
    accessRequirements: Requirement[];
    nodes: ResearchNodeDef[];
}

