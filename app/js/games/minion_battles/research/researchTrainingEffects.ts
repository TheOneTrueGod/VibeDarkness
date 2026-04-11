/**
 * Training research tree effects applied at runtime (battle).
 * Health bonuses and ability modifiers are looked up here.
 */

import { getDefaultHp } from '../game/units/unit_defs/unitDef';
import { TRAINING_TREE_ID } from '../../../researchTrees/trees/training';

/** Map of research node ID -> extra max health granted. */
export const RESEARCH_HEALTH_BONUSES: Record<string, number> = {
    core_training: 20,
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
