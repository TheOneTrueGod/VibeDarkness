import type { ResearchTreeDef } from './types';
import { techShieldTree } from './trees/tech_shield';
import { crystalRocksTree } from './trees/crystal_rocks';
import { trainingTree } from './trees/training';
import { stickSwordTree } from './trees/stick_sword';

export const RESEARCH_TREES: ResearchTreeDef[] = [techShieldTree, crystalRocksTree, trainingTree, stickSwordTree];

export function getResearchTree(treeId: string): ResearchTreeDef | undefined {
    return RESEARCH_TREES.find((t) => t.id === treeId);
}

