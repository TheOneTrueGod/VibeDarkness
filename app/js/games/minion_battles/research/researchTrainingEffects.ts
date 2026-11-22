/**
 * Training research tree effects applied at runtime (battle): the punch-upgrade state.
 * Stat bonuses (Core Training, Healthy, Mighty) are node `passiveBonus` entries, read through the passive bag.
 */

import {
    TRAINING_NODE_CHARGING_PUNCH,
    TRAINING_NODE_DOUBLE_PUNCH,
    TRAINING_NODE_SNEAKY_PUNCH,
    TRAINING_NODE_STRONG_PUNCH,
    TRAINING_TREE_ID,
} from '../../../researchTrees/trees/training';
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
