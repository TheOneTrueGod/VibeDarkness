import { describe, expect, it } from 'vitest';
import {
    buildChapterSkipPlan,
    getNextChapterSkipStep,
    isChapterSkippable,
    stripChapterResearchRewards,
    type ChapterSkipCharacterState,
    type ChapterSkipPick,
} from './chapterSkip';
import { WorldOfDarknessStoryline } from './WorldOfDarkness/WorldOfDarkness';
import { MISSION_MAP } from './index';
import { TRAINING_NODE_STRONG_PUNCH, TRAINING_TREE_ID } from '../../../researchTrees/trees/training';
import { ResearchSource } from '../../../researchTrees/types';
import { EARTH_NODE_EARTH_CORE, EARTH_TREE_ID } from '../../../researchTrees/trees/earth';
import { STORY_CHOICE_SKIP_OPTION_ID } from './storyChoiceOptions';
import type { MissionResult } from '../../../types';

const REWARD_TREE_ID = TRAINING_TREE_ID;
const CHAPTER_ONE = WorldOfDarknessStoryline.chapters!.find((c) => c.id === 'wod_ch1')!;
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
    towards_the_light_cave_choice: 'weapon_011',
    cave_respite_punch_choice: TRAINING_NODE_STRONG_PUNCH,
};

describe('chapter skip - Chapter I', () => {
    it('is the only admin-skippable chapter', () => {
        const skippable = WorldOfDarknessStoryline.chapters!.filter((c) => isChapterSkippable(c));
        expect(skippable.map((c) => c.id)).toEqual(['wod_ch1']);
    });

    it('never offers an admin-only chapter (Chapter 0) for skipping', () => {
        const ch0 = WorldOfDarknessStoryline.chapters!.find((c) => c.adminOnly)!;
        expect(isChapterSkippable(ch0)).toBe(false);
        expect(isChapterSkippable({ ...ch0, adminSkippable: true })).toBe(false);
        expect(() => getNextChapterSkipStep(ch0, freshState(), [], CTX)).toThrow(/admin-only/);
    });

    it('asks for each reward choice in story order', () => {
        const picks = walk(freshState(), ROCKS_PATH);
        expect(picks.map((p) => `${p.missionId}:${p.choiceId}`)).toEqual([
            'dark_awakening:dark_awakening_weapon',
            'towards_the_light:towards_the_light_cave_choice',
            'cave_respite:cave_respite_punch_choice',
            'core_awakening:core_awakening_reward',
        ]);
    });

    it('resolves later options from earlier picks (the equipped weapon drives the next offer)', () => {
        const picks: ChapterSkipPick[] = [
            { missionId: 'dark_awakening', choiceId: 'dark_awakening_weapon', optionId: 'rocks' },
        ];
        const step = getNextChapterSkipStep(CHAPTER_ONE, freshState(), picks, CTX)!;
        expect(step.missionId).toBe('towards_the_light');
        expect(step.options.length).toBeGreaterThan(0);
    });

    it('unlocks each tier of weapons on the mission result that rewards it', () => {
        const picks = walk(freshState(), ROCKS_PATH);
        const plan = buildChapterSkipPlan(CHAPTER_ONE, freshState(), picks, CTX);
        const byId = Object.fromEntries(plan.missionResults.map((r) => [r.missionId, r]));
        expect(byId.dark_awakening.itemIds).toEqual(expect.arrayContaining(['001', '002', '003']));
        expect(byId.dark_awakening.itemIds).not.toContain('011');
        expect(byId.towards_the_light.itemIds).toEqual(
            expect.arrayContaining(['011', '012', '013', '014', '015']),
        );
        expect(byId.towards_the_light.itemIds).toContain('016');
    });

    it('offers every player the same four tier-2 weapons at the cave, whatever they started with', () => {
        const rocksPicks: ChapterSkipPick[] = [
            { missionId: 'dark_awakening', choiceId: 'dark_awakening_weapon', optionId: 'rocks' },
        ];
        const rocksStep = getNextChapterSkipStep(CHAPTER_ONE, freshState(), rocksPicks, CTX)!;
        expect(rocksStep.options.map((o) => (o.action as { itemId?: string }).itemId).filter(Boolean)).toEqual([
            '011',
            '012',
            '013',
            '014',
        ]);
    });

    it('resolves an equipmentUpgrade pick into an equip_item that replaces the old weapon', () => {
        const start = freshState([ROCKS]);
        const full = walk(start, { ...ROCKS_PATH, towards_the_light_cave_choice: 'weapon_012' });
        const plan = buildChapterSkipPlan(CHAPTER_ONE, start, full, CTX);
        expect(plan.state.equipment).toContain('012');
        expect(plan.state.equipment).not.toContain(ROCKS);
        const result = plan.missionResults.find((r) => r.missionId === 'towards_the_light')!;
        expect(result.itemIds).toContain('012');
    });

    it('builds the character state a real run would leave behind', () => {
        const start = freshState([STICK]);
        const picks = walk(start, ROCKS_PATH);
        const plan = buildChapterSkipPlan(CHAPTER_ONE, start, picks, CTX);

        // The Rocks pick replaced the Stick in the same slot, so no upgrade of the Stick can be equipped.
        expect(plan.state.equipment).not.toContain(STICK);

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
        expect(byId.dark_awakening.itemIds).toContain(ROCKS);
        expect(byId.cave_respite.researchRewards?.length).toBeGreaterThan(0);
        expect(byId.core_awakening.researchRewards).toHaveLength(1);
        expect(byId.light_empowered.researchRewards).toBeUndefined();

        expect(plan.knowledgeKeys).toEqual(expect.arrayContaining(['Research', 'CompletedChapter1']));
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
                [REWARD_TREE_ID]: [TRAINING_NODE_STRONG_PUNCH, 'more_rock'],
            },
            researchNodeLevels: { [REWARD_TREE_ID]: { [TRAINING_NODE_STRONG_PUNCH]: 1, more_rock: 1 } },
            researchSources: {
                [REWARD_TREE_ID]: {
                    [TRAINING_NODE_STRONG_PUNCH]: [ResearchSource.QuestReward],
                    more_rock: [ResearchSource.Purchased],
                },
            },
        };
        const results: MissionResult[] = [
            {
                missionId: 'towards_the_light',
                result: 'victory',
                researchRewards: [{ treeId: REWARD_TREE_ID, nodeId: TRAINING_NODE_STRONG_PUNCH }],
            },
            // Outside the chapter: left alone.
            { missionId: 'campsite', result: 'victory', researchRewards: [{ treeId: REWARD_TREE_ID, nodeId: 'more_rock' }] },
        ];

        const next = stripChapterResearchRewards(state, results, CHAPTER_ONE.missionIds);
        expect(next.researchTrees[REWARD_TREE_ID]).toEqual(['more_rock']);
        expect(next.researchNodeLevels[REWARD_TREE_ID]).toEqual({ more_rock: 1 });
        expect(next.researchSources[REWARD_TREE_ID]).toEqual({ more_rock: [ResearchSource.Purchased] });
        // Input is not mutated.
        expect(state.researchTrees[REWARD_TREE_ID]).toHaveLength(2);
    });
});
