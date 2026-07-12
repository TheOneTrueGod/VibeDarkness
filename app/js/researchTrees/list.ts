import type { ResearchNodeDef, ResearchTreeDef } from './types';
import type { MissionResearchRewardEntry } from '../types';
import { techShieldTree } from './trees/tech_shield';
import { crystalRocksTree } from './trees/crystal_rocks';
import { trainingTree } from './trees/training';
import { stickSwordTree } from './trees/stick_sword';
import { miscTree } from './trees/misc';
import { earthTree } from './trees/earth';
import { commandCoreTree } from './trees/command_core';
import { lightTree } from './trees/light';
import { gravityTree } from './trees/gravity';
import { bloodMageTree } from './trees/blood_mage';

export const RESEARCH_TREES: ResearchTreeDef[] = [techShieldTree, crystalRocksTree, trainingTree, stickSwordTree, miscTree, earthTree, commandCoreTree, lightTree, gravityTree, bloodMageTree];

export function getResearchTree(treeId: string): ResearchTreeDef | undefined {
    return RESEARCH_TREES.find((t) => t.id === treeId);
}

export function getResearchNode(treeId: string, nodeId: string) {
    const tree = getResearchTree(treeId);
    if (!tree) return undefined;
    return tree.nodes.find((node) => node.id === nodeId);
}

export interface ResolvedResearchReward {
    rewardId: string;
    treeId: string;
    nodeId: string;
    node: ResearchNodeDef;
}

export function parseResearchRewardId(rewardId: string): { treeId: string; nodeId: string } | null {
    const [treeId, nodeId] = rewardId.split('+');
    if (!treeId || !nodeId) return null;
    return { treeId, nodeId };
}

export function getResolvedResearchRewards(
    rewardIds: string[] | undefined,
): ResolvedResearchReward[] {
    if (!Array.isArray(rewardIds) || rewardIds.length === 0) return [];
    const out: ResolvedResearchReward[] = [];
    for (const rewardId of rewardIds) {
        const parsed = parseResearchRewardId(rewardId);
        if (!parsed) continue;
        const node = getResearchNode(parsed.treeId, parsed.nodeId);
        if (!node) continue;
        out.push({
            rewardId,
            treeId: parsed.treeId,
            nodeId: parsed.nodeId,
            node,
        });
    }
    return out;
}

export function getResolvedResearchRewardsFromEntries(
    entries: MissionResearchRewardEntry[] | undefined,
): ResolvedResearchReward[] {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    const out: ResolvedResearchReward[] = [];
    for (const entry of entries) {
        const rewardId = `${entry.treeId}+${entry.nodeId}`;
        const node = getResearchNode(entry.treeId, entry.nodeId);
        if (!node) continue;
        out.push({
            rewardId,
            treeId: entry.treeId,
            nodeId: entry.nodeId,
            node,
        });
    }
    return out;
}

export function getResearchTreesForKnowledgeKey(key: string): ResearchTreeDef[] {
    return RESEARCH_TREES.filter((tree) =>
        tree.accessRequirements.some((r) => r.type === 'accountKnowledge' && r.key === key),
    );
}

export function getResolvedMissionResearchRewards(payload: {
    researchRewardIds?: string[];
    researchRewards?: MissionResearchRewardEntry[];
} | null | undefined): ResolvedResearchReward[] {
    if (!payload) return [];
    const fromEntries = getResolvedResearchRewardsFromEntries(payload.researchRewards);
    const fromIds = getResolvedResearchRewards(payload.researchRewardIds);
    if (fromEntries.length === 0) return fromIds;
    if (fromIds.length === 0) return fromEntries;
    const seen = new Set(fromEntries.map((reward) => reward.rewardId));
    return [...fromEntries, ...fromIds.filter((reward) => !seen.has(reward.rewardId))];
}

