import { describe, expect, it } from 'vitest';
import {
    buildChapterSkipPlan,
    getNextChapterSkipStep,
    stripChapterResearchRewards,
    type ChapterSkipCharacterState,
    type ChapterSkipPick,
} from './chapterSkip';
import { WorldOfDarknessStoryline } from './WorldOfDarkness/WorldOfDarkness';
import { MISSION_MAP } from './index';
import { CRYSTAL_ROCKS_NODE_CHARGED_ROCKS, CRYSTAL_ROCKS_TREE_ID } from '../../../researchTrees/trees/crystal_rocks';
import { TRAINING_NODE_STRONG_PUNCH, TRAINING_TREE_ID } from '../../../researchTrees/trees/training';
import { ResearchSource } from '../../../researchTrees/types';
import { EARTH_NODE_EARTH_CORE, EARTH_TREE_ID } from '../../../researchTrees/trees/earth';
import { STORY_CHOICE_SKIP_OPTION_ID } from './storyChoiceOptions';
import type { MissionResult } from '../../../types';

const CHAPTER_ONE = WorldOfDarknessStoryline.chapters![0];
const ROCKS = '001';
const STICK = '002';
const CTX = { playerId: '2', accountKnowledge: {} };

function freshState(equipment: string[] = []): ChapterSkipCharacterState {
    return { equipment, researchTrees: {}, researchNodeLevels: {}, researchSources: {} };
}

/** Walk the wizard, picking `preferred[choiceId]` when offered, otherwise the first enabled option. */
function walk(state: ChapterSkipCharacterState, preferred: Record<string, string>): ChapterSkipPick[] {
    const picks: ChapterSkipPick[] = [];
    for (let guard = 0; guard < 20; guard++) {
        const step = getNextChapterSkipStep(CHAPTER_ONE, state, picks, CTX);
        if (!step) return picks;
        const enabled = step.options.filter((o) => !o.disabledLabel);
        expect(enabled.length).toBeGreaterThan(0);
        const option = enabled.find((o) => o.id === preferred[step.choiceId]) ?? enabled[0];
        picks.push({ missionId: step.missionId, choiceId: step.choiceId, optionId: option.id });
    }
    throw new Error('wizard did not finish');
}

const ROCKS_PATH = {
    dark_awakening_weapon: 'rocks',
    towards_the_light_cave_choice: 'slot_0',
    cave_respite_punch_choice: TRAINING_NODE_STRONG_PUNCH,
    cave_respite_research_choice: 'more_rock',
};

describe('chapter skip - Chapter I', () => {
    it('is the only admin-skippable chapter', () => {
        expect(WorldOfDarknessStoryline.chapters!.map((c) => !!c.adminSkippable)).toEqual([true, false, false]);
    });

    it('asks for each reward choice in story order', () => {
        const picks = walk(freshState(), ROCKS_PATH);
        expect(picks.map((p) => `${p.missionId}:${p.choiceId}`)).toEqual([
            'dark_awakening:dark_awakening_weapon',
            'towards_the_light:towards_the_light_cave_choice',
            'cave_respite:cave_respite_punch_choice',
            'cave_respite:cave_respite_research_choice',
            'core_awakening:core_awakening_reward',
        ]);
    });

    it('resolves later options from earlier picks (Rocks -> rock upgrades)', () => {
        const picks: ChapterSkipPick[] = [
            { missionId: 'dark_awakening', choiceId: 'dark_awakening_weapon', optionId: 'rocks' },
        ];
        const step = getNextChapterSkipStep(CHAPTER_ONE, freshState(), picks, CTX)!;
        expect(step.missionId).toBe('towards_the_light');
        const offered = step.options.map((o) => (o.action as { treeId?: string }).treeId);
        expect(offered).toContain(CRYSTAL_ROCKS_TREE_ID);
    });

    it('builds the character state a real run would leave behind', () => {
        const start = freshState([STICK]);
        const picks = walk(start, ROCKS_PATH);
        const plan = buildChapterSkipPlan(CHAPTER_ONE, start, picks, CTX);

        // Rocks replaced the Stick in the same slot.
        expect(plan.state.equipment).toContain(ROCKS);
        expect(plan.state.equipment).not.toContain(STICK);

        expect(plan.state.researchTrees[CRYSTAL_ROCKS_TREE_ID]).toEqual(
            expect.arrayContaining([CRYSTAL_ROCKS_NODE_CHARGED_ROCKS, 'more_rock']),
        );
        expect(plan.state.researchTrees[TRAINING_TREE_ID]).toContain(TRAINING_NODE_STRONG_PUNCH);
        expect(plan.state.researchSources[TRAINING_TREE_ID][TRAINING_NODE_STRONG_PUNCH]).toEqual([
            ResearchSource.QuestReward,
        ]);

        // Every chapter mission is recorded as a victory, in chapter order.
        expect(plan.missionResults.map((r) => r.missionId)).toEqual(CHAPTER_ONE.missionIds);
        for (const result of plan.missionResults) {
            expect(result.result).toBe('victory');
            expect(result.adminGranted).toBe(true);
            expect(result.resourceDelta).toEqual(MISSION_MAP[result.missionId].completionRewards?.resourceDelta);
        }
        const byId = Object.fromEntries(plan.missionResults.map((r) => [r.missionId, r]));
        expect(byId.dark_awakening.itemIds).toEqual([ROCKS]);
        expect(byId.towards_the_light.researchRewards).toEqual([
            { treeId: CRYSTAL_ROCKS_TREE_ID, nodeId: CRYSTAL_ROCKS_NODE_CHARGED_ROCKS },
        ]);
        expect(byId.cave_respite.researchRewards).toHaveLength(2);
        expect(byId.core_awakening.researchRewards).toHaveLength(1);
        expect(byId.light_empowered.researchRewards).toBeUndefined();

        expect(plan.knowledgeKeys).toEqual(expect.arrayContaining(['Research', 'AlphaWolfDefeated']));
    });

    it('offers the "no reward" skip on every post-mission choice, like the live story', () => {
        const picks = walk(freshState(), ROCKS_PATH);
        for (let i = 1; i < picks.length; i++) {
            const step = getNextChapterSkipStep(CHAPTER_ONE, freshState(), picks.slice(0, i), CTX)!;
            expect(step.options.some((o) => o.id === STORY_CHOICE_SKIP_OPTION_ID)).toBe(true);
        }
    });

    it('lets a character that already owns a core skip the Core Awakening reward', () => {
        const start: ChapterSkipCharacterState = {
            ...freshState(),
            researchTrees: { [EARTH_TREE_ID]: [EARTH_NODE_EARTH_CORE] },
            researchSources: { [EARTH_TREE_ID]: { [EARTH_NODE_EARTH_CORE]: [ResearchSource.Admin] } },
        };
        const picks = walk(start, ROCKS_PATH);
        const last = picks[picks.length - 1];
        expect(last).toEqual({
            missionId: 'core_awakening',
            choiceId: 'core_awakening_reward',
            optionId: STORY_CHOICE_SKIP_OPTION_ID,
        });
        const plan = buildChapterSkipPlan(CHAPTER_ONE, start, picks, CTX);
        const core = plan.missionResults.find((r) => r.missionId === 'core_awakening')!;
        expect(core.researchRewards).toBeUndefined();
        expect(plan.state.researchTrees[EARTH_TREE_ID]).toContain(EARTH_NODE_EARTH_CORE);
    });

    it('rejects a pick that is not offered', () => {
        const picks: ChapterSkipPick[] = [
            { missionId: 'dark_awakening', choiceId: 'dark_awakening_weapon', optionId: 'not_an_option' },
        ];
        expect(() => buildChapterSkipPlan(CHAPTER_ONE, freshState(), picks, CTX)).toThrow();
    });
});

describe('stripChapterResearchRewards', () => {
    it('removes one level per research reward on earlier results, keeping other research', () => {
        const state: ChapterSkipCharacterState = {
            equipment: [ROCKS],
            researchTrees: {
                [CRYSTAL_ROCKS_TREE_ID]: [CRYSTAL_ROCKS_NODE_CHARGED_ROCKS, 'more_rock'],
            },
            researchNodeLevels: { [CRYSTAL_ROCKS_TREE_ID]: { [CRYSTAL_ROCKS_NODE_CHARGED_ROCKS]: 1, more_rock: 1 } },
            researchSources: {
                [CRYSTAL_ROCKS_TREE_ID]: {
                    [CRYSTAL_ROCKS_NODE_CHARGED_ROCKS]: [ResearchSource.QuestReward],
                    more_rock: [ResearchSource.Purchased],
                },
            },
        };
        const results: MissionResult[] = [
            {
                missionId: 'towards_the_light',
                result: 'victory',
                researchRewards: [{ treeId: CRYSTAL_ROCKS_TREE_ID, nodeId: CRYSTAL_ROCKS_NODE_CHARGED_ROCKS }],
            },
            // Outside the chapter: left alone.
            { missionId: 'campsite', result: 'victory', researchRewards: [{ treeId: CRYSTAL_ROCKS_TREE_ID, nodeId: 'more_rock' }] },
        ];

        const next = stripChapterResearchRewards(state, results, CHAPTER_ONE.missionIds);
        expect(next.researchTrees[CRYSTAL_ROCKS_TREE_ID]).toEqual(['more_rock']);
        expect(next.researchNodeLevels[CRYSTAL_ROCKS_TREE_ID]).toEqual({ more_rock: 1 });
        expect(next.researchSources[CRYSTAL_ROCKS_TREE_ID]).toEqual({ more_rock: [ResearchSource.Purchased] });
        // Input is not mutated.
        expect(state.researchTrees[CRYSTAL_ROCKS_TREE_ID]).toHaveLength(2);
    });
});
