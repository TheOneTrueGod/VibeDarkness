import type { ReactNode } from 'react';

/** True when the character has researched at least one node. */
export function characterHasResearch(researchTrees: Record<string, string[]> | undefined): boolean {
    if (!researchTrees) return false;
    for (const nodeIds of Object.values(researchTrees)) {
        if (nodeIds.length > 0) return true;
    }
    return false;
}

/** Players see Upgrades after they have research; admins always see it. */
export function shouldShowUpgradesTab(
    isAdmin: boolean,
    researchTrees: Record<string, string[]> | undefined,
): boolean {
    return isAdmin || characterHasResearch(researchTrees);
}

/** Campaign-home Upgrades tab body. */
export default function Upgrades({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
