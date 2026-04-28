/**
 * Training research tree effects applied at runtime (battle).
 * Health bonuses and ability modifiers are looked up here.
 */

import {
    TRAINING_NODE_CHARGING_PUNCH,
    TRAINING_NODE_CORE,
    TRAINING_NODE_DOUBLE_PUNCH,
    TRAINING_NODE_SNEAKY_PUNCH,
    TRAINING_NODE_STRONG_PUNCH,
    TRAINING_TREE_ID,
} from '../../../researchTrees/trees/training';
import { DescriptiveValue, getApproxIntegerIncrease } from '../../../researchTrees/descriptiveValue';

const CORE_TRAINING_DAMAGE_BASELINE = 8;
const CORE_TRAINING_HEALTH_BASELINE = 100;

/** Map of research node ID -> extra max health granted. */
export const RESEARCH_HEALTH_BONUSES: Record<string, number> = {
    [TRAINING_NODE_CORE]: getApproxIntegerIncrease(CORE_TRAINING_HEALTH_BASELINE, DescriptiveValue.Small),
};

/** Map of research node ID -> flat damage bonus applied to ability damage. */
export const RESEARCH_DAMAGE_BONUSES: Record<string, number> = {
    [TRAINING_NODE_CORE]: getApproxIntegerIncrease(CORE_TRAINING_DAMAGE_BASELINE, DescriptiveValue.Tiny),
};

export interface TrainingPunchResearchState {
    hasDoublePunch: boolean;
    hasStrongPunch: boolean;
    hasSneakyPunch: boolean;
    hasChargingPunch: boolean;
}

/** Map researched nodes to a punch-upgrade state object for combat code. */
export function getTrainingPunchResearchState(
    getResearchNodes: (treeId: string) => string[],
): TrainingPunchResearchState {
    const nodes = new Set(getResearchNodes(TRAINING_TREE_ID));
    return {
        hasDoublePunch: nodes.has(TRAINING_NODE_DOUBLE_PUNCH),
        hasStrongPunch: nodes.has(TRAINING_NODE_STRONG_PUNCH),
        hasSneakyPunch: nodes.has(TRAINING_NODE_SNEAKY_PUNCH),
        hasChargingPunch: nodes.has(TRAINING_NODE_CHARGING_PUNCH),
    };
}

/** Get total health bonus from Training research for a player. */
export function getHealthBonusFromResearch(
    getResearchNodes: (treeId: string) => string[],
): number {
    const nodes = getResearchNodes(TRAINING_TREE_ID);
    let total = 0;
    for (const nodeId of nodes) {
        total += RESEARCH_HEALTH_BONUSES[nodeId] ?? 0;
    }
    return total;
}

/** Get total flat damage bonus from Training research for a player. */
export function getDamageBonusFromResearch(
    getResearchNodes: (treeId: string) => string[],
): number {
    const nodes = getResearchNodes(TRAINING_TREE_ID);
    let total = 0;
    for (const nodeId of nodes) {
        total += RESEARCH_DAMAGE_BONUSES[nodeId] ?? 0;
    }
    return total;
}
