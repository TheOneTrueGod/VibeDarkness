import {
    computePassiveBonuses,
    getNonZeroPassiveBonusRows,
} from '../../../../researchTrees/passiveBonuses';
import type { ResearchNodeLevels } from '../../../../researchTrees/types';

/** True when researched passives produce at least one non-zero stat bonus. */
export function characterHasStatBonuses(
    researchTrees: Record<string, string[]> | undefined,
    researchNodeLevels?: ResearchNodeLevels,
): boolean {
    const bonuses = computePassiveBonuses(researchTrees, researchNodeLevels);
    return getNonZeroPassiveBonusRows(bonuses).length > 0;
}

export { default } from '../../../../games/minion_battles/ui/components/CharacterEditor/StatBonusesTab';
