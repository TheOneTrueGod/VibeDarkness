import { describe, expect, it } from 'vitest';
import { DEFAULT_RESEARCH_NODE_LEVELS } from './passiveBonuses';
import {
    countResearchSourceLevels,
    formatResearchSourcesLabel,
    getNodeResearchSources,
    hasResearchOfSource,
    RESEARCH_SOURCE_LABEL_JOIN,
    stripResearchBySource,
} from './researchSources';
import { ResearchSource } from './types';
import { TRAINING_NODE_HEALTHY, TRAINING_TREE_ID } from './trees/training';

const HEALTHY_TREES = { [TRAINING_TREE_ID]: [TRAINING_NODE_HEALTHY] };

describe('getNodeResearchSources', () => {
    it('treats missing sources as Purchased for each owned level', () => {
        const sources = getNodeResearchSources(
            TRAINING_TREE_ID,
            TRAINING_NODE_HEALTHY,
            HEALTHY_TREES,
            { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: 2 } },
            undefined,
        );
        expect(sources).toEqual([ResearchSource.Purchased, ResearchSource.Purchased]);
    });

    it('pads stored sources to the current level with Purchased', () => {
        const sources = getNodeResearchSources(
            TRAINING_TREE_ID,
            TRAINING_NODE_HEALTHY,
            HEALTHY_TREES,
            { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: 2 } },
            { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: [ResearchSource.QuestReward] } },
        );
        expect(sources).toEqual([ResearchSource.QuestReward, ResearchSource.Purchased]);
    });
});

describe('formatResearchSourcesLabel', () => {
    it('returns empty when there are no sources', () => {
        expect(formatResearchSourcesLabel([])).toBe('');
    });

    it('keeps first-seen order and drops duplicates', () => {
        expect(formatResearchSourcesLabel([
            ResearchSource.QuestReward,
            ResearchSource.Purchased,
            ResearchSource.QuestReward,
        ])).toBe(
            `${ResearchSource.QuestReward}${RESEARCH_SOURCE_LABEL_JOIN}${ResearchSource.Purchased}`,
        );
    });
});

describe('stripResearchBySource', () => {
    it('removes only Purchased levels and keeps quest rewards', () => {
        const result = stripResearchBySource(
            HEALTHY_TREES,
            { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: 2 } },
            {
                [TRAINING_TREE_ID]: {
                    [TRAINING_NODE_HEALTHY]: [ResearchSource.QuestReward, ResearchSource.Purchased],
                },
            },
            ResearchSource.Purchased,
        );
        expect(result.researchTrees[TRAINING_TREE_ID]).toEqual([TRAINING_NODE_HEALTHY]);
        expect(result.researchNodeLevels[TRAINING_TREE_ID]?.[TRAINING_NODE_HEALTHY]).toBe(
            DEFAULT_RESEARCH_NODE_LEVELS,
        );
        expect(result.researchSources[TRAINING_TREE_ID]?.[TRAINING_NODE_HEALTHY]).toEqual([
            ResearchSource.QuestReward,
        ]);
        expect(result.removedNodeIdsByTree[TRAINING_TREE_ID]).toBeUndefined();
    });

    it('drops a node when every level is stripped', () => {
        const result = stripResearchBySource(
            HEALTHY_TREES,
            undefined,
            { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: [ResearchSource.Admin] } },
            ResearchSource.Admin,
        );
        expect(result.researchTrees[TRAINING_TREE_ID]).toEqual([]);
        expect(result.removedNodeIdsByTree[TRAINING_TREE_ID]).toEqual([TRAINING_NODE_HEALTHY]);
    });
});

describe('hasResearchOfSource', () => {
    it('detects a matching source among owned levels', () => {
        expect(
            hasResearchOfSource(
                HEALTHY_TREES,
                undefined,
                { [TRAINING_TREE_ID]: { [TRAINING_NODE_HEALTHY]: [ResearchSource.Admin] } },
                ResearchSource.Admin,
            ),
        ).toBe(true);
        expect(
            hasResearchOfSource(HEALTHY_TREES, undefined, undefined, ResearchSource.Purchased),
        ).toBe(true);
        expect(
            hasResearchOfSource(HEALTHY_TREES, undefined, undefined, ResearchSource.QuestReward),
        ).toBe(false);
    });
});

describe('countResearchSourceLevels', () => {
    it('counts matching entries', () => {
        expect(
            countResearchSourceLevels(
                [ResearchSource.QuestReward, ResearchSource.Purchased, ResearchSource.Purchased],
                ResearchSource.Purchased,
            ),
        ).toBe(2);
    });
});
