import type { ResearchTreeDef } from './types';
import { techShieldTree } from './trees/tech_shield';

export const RESEARCH_TREES: ResearchTreeDef[] = [techShieldTree];

export function getResearchTree(treeId: string): ResearchTreeDef | undefined {
    return RESEARCH_TREES.find((t) => t.id === treeId);
}

