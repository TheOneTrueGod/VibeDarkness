/**
 * Training research tree effects applied at runtime (battle).
 * Health bonuses and ability modifiers are looked up here.
 */

import { TRAINING_TREE_ID } from '../../../researchTrees/trees/training';
import { DescriptiveValue, getApproxIntegerIncrease } from '../../../researchTrees/descriptiveValue';

const CORE_TRAINING_DAMAGE_BASELINE = 8;
const CORE_TRAINING_HEALTH_BASELINE = 100;

/** Map of research node ID -> extra max health granted. */
export const RESEARCH_HEALTH_BONUSES: Record<string, number> = {
    core_training: getApproxIntegerIncrease(CORE_TRAINING_HEALTH_BASELINE, DescriptiveValue.Small),
};

/** Map of research node ID -> flat damage bonus applied to ability damage. */
export const RESEARCH_DAMAGE_BONUSES: Record<string, number> = {
    core_training: getApproxIntegerIncrease(CORE_TRAINING_DAMAGE_BASELINE, DescriptiveValue.Tiny),
};

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
