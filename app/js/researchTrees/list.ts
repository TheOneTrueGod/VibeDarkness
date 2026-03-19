import type { ResearchTreeDef } from './types';
import { techShieldTree } from './trees/tech_shield';
import { crystalRocksTree } from './trees/crystal_rocks';

export const RESEARCH_TREES: ResearchTreeDef[] = [techShieldTree, crystalRocksTree];

export function getResearchTree(treeId: string): ResearchTreeDef | undefined {
    return RESEARCH_TREES.find((t) => t.id === treeId);
}

