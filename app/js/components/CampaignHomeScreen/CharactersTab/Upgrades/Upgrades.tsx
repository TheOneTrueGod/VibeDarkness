import type { ReactNode } from 'react';
import { hasUpgradesSystem, type AccountKnowledgeMap } from '../../../../accountKnowledge';

/** True when the character has researched at least one node. */
export function characterHasResearch(researchTrees: Record<string, string[]> | undefined): boolean {
    if (!researchTrees) return false;
    for (const nodeIds of Object.values(researchTrees)) {
        if (nodeIds.length > 0) return true;
    }
    return false;
}

/**
 * Players see Upgrades once they know the Upgrades system and the character has research;
 * admins always see it.
 */
export function shouldShowUpgradesTab(
    isAdmin: boolean,
    researchTrees: Record<string, string[]> | undefined,
    knowledge: AccountKnowledgeMap,
): boolean {
    if (isAdmin) return true;
    return hasUpgradesSystem(knowledge, false) && characterHasResearch(researchTrees);
}

/** Campaign-home Upgrades tab body. */
export default function Upgrades({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
