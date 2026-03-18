export type { CampaignResourceKey } from '../types';
import type { CampaignResourceKey } from '../types';

export type CampaignResourceCost = Partial<Record<CampaignResourceKey, number>>;

export type Requirement =
    | { type: 'accountKnowledge'; key: string }
    | { type: 'campaignResourceMin'; resource: CampaignResourceKey; min: number }
    | { type: 'characterHasEquippedItem'; itemId: string }
    | { type: 'characterHasTrait'; trait: string }
    | { type: 'notResearched'; treeId: string; nodeId: string };

export type ResearchEffect =
    | { type: 'replaceEquippedItem'; fromItemId: string; toItemId: string }
    | { type: 'addExtraCardsFromItem'; itemId: string; cardId: string; count: number };

export interface ResearchNodeDef {
    id: string;
    title: string;
    /** Stable ordering used for deterministic application. Lower applies first. */
    order: number;
    position: { x: number; y: number };
    prereqNodeIds: string[];
    exclusiveWithNodeIds: string[];
    requirements: Requirement[];
    cost: CampaignResourceCost;
    effects: ResearchEffect[];
}

export interface ResearchTreeDef {
    id: string;
    title: string;
    /** Tree-level requirements to show/allow (unless it has any node researched). */
    accessRequirements: Requirement[];
    nodes: ResearchNodeDef[];
}

