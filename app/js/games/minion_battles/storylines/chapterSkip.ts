/**
 * Admin "Skip Chapter": replays a chapter's story choices against a character without playing it.
 *
 * Each `choice` phrase in the chapter's missions (pre-mission story, then post-mission story, in
 * chapter order) becomes one wizard step. Options are resolved with the same logic the live story
 * uses (`researchRewardSlots` or the mission's `getPostMissionChoiceOptions`), against the
 * character state left by the earlier picks, so later steps react to earlier ones.
 *
 * Pure: callers persist `buildChapterSkipPlan`'s result (character fields, per-mission results,
 * account knowledge). Only chapters flagged `adminSkippable` (and never `adminOnly` ones) are offered in the UI.
 */
import type { MissionResearchRewardEntry, MissionResult, CampaignResourceKey } from '../../../types';
import type { CampaignChapterDef } from './types';
import type { IBaseMissionDef } from './BaseMissionDef';
import type { ChoicePhrase, StoryChoiceAction, StoryChoiceOptionRow } from './storyTypes';
import { MISSION_BONUS_RESOURCE_KEYS } from '../../../campaignResources';
import { MISSION_MAP } from './index';
import { resolveResearchRewardSlots } from './researchRewardSlots';
import { resolveUnlockedTierItemIds } from './unlockItemTiers';
import {
    createStoryChoiceSkipOption,
    filterChoiceOptionsByResearch,
    needsPreMissionSkipOption,
    withPostMissionSkipOption,
} from './storyChoiceOptions';
import { getItemDef } from '../character_defs/items';
import { getResearchNode, getResolvedMissionResearchRewards } from '../../../researchTrees/list';
import { getNodeLevel, getNodeMaxLevels } from '../../../researchTrees/passiveBonuses';
import { getNodeResearchSources } from '../../../researchTrees/researchSources';
import { ResearchSource, type ResearchNodeLevels, type ResearchNodeSources } from '../../../researchTrees/types';

/** The character fields a chapter skip reads and rewrites. */
export interface ChapterSkipCharacterState {
    equipment: string[];
    researchTrees: Record<string, string[]>;
    researchNodeLevels: ResearchNodeLevels;
    researchSources: ResearchNodeSources;
}

export interface ChapterSkipContext {
    /** Lobby player id the live story would see (the character owner's account id). */
    playerId: string;
    /** Owner's account knowledge before the skip; chapter knowledge rewards are added as missions finish. */
    accountKnowledge: Record<string, unknown>;
}

/** One wizard step: a single choice phrase with its resolved options. */
export interface ChapterSkipStep {
    missionId: string;
    missionName: string;
    choiceId: string;
    options: StoryChoiceOptionRow[];
    /** 0-based index of this step's mission among the chapter's missions that have choices. */
    missionStepIndex: number;
    missionStepCount: number;
}

export interface ChapterSkipPick {
    missionId: string;
    choiceId: string;
    optionId: string;
}

export interface ChapterSkipPlan {
    state: ChapterSkipCharacterState;
    /** One victory per chapter mission, in chapter order (no timestamp; the caller stamps it). */
    missionResults: MissionResult[];
    /** Account knowledge keys granted by the chapter's missions. */
    knowledgeKeys: string[];
}

function missionDef(missionId: string): IBaseMissionDef {
    const def = MISSION_MAP[missionId];
    if (!def) throw new Error(`Chapter skip: unknown mission ${missionId}`);
    return def;
}

type StoryStage = 'pre' | 'post';

/** The mission's choice phrases in story order, tagged with the story they belong to. */
function choicePhrases(def: IBaseMissionDef): { stage: StoryStage; phrase: ChoicePhrase }[] {
    const tagged = (stage: StoryStage, phrases: readonly { type: string }[] | undefined) =>
        (phrases ?? [])
            .filter((p): p is ChoicePhrase => p.type === 'choice')
            .map((phrase) => ({ stage, phrase }));
    return [...tagged('pre', def.preMissionStory?.phrases), ...tagged('post', def.postMissionStory?.phrases)];
}

function researchCount(trees: Record<string, string[]>): number {
    return Object.values(trees).reduce((n, ids) => n + ids.length, 0);
}

/** Same rows the live story phases show (see `storyChoiceOptions.ts`), including the skip row. */
function resolveOptions(
    def: IBaseMissionDef,
    stage: StoryStage,
    phrase: ChoicePhrase,
    state: ChapterSkipCharacterState,
    ctx: ChapterSkipContext,
    knowledge: Record<string, unknown>,
): StoryChoiceOptionRow[] {
    if (stage === 'pre') {
        const visible = filterChoiceOptionsByResearch(phrase.options, state.researchTrees);
        return needsPreMissionSkipOption(phrase.options, visible)
            ? [...visible, createStoryChoiceSkipOption()]
            : visible;
    }
    return withPostMissionSkipOption(resolvePostMissionOptions(def, phrase, state, ctx, knowledge));
}

/** Post-mission rows before the skip row: `researchRewardSlots`, the mission's resolver, or static options. */
function resolvePostMissionOptions(
    def: IBaseMissionDef,
    phrase: ChoicePhrase,
    state: ChapterSkipCharacterState,
    ctx: ChapterSkipContext,
    knowledge: Record<string, unknown>,
): StoryChoiceOptionRow[] {
    if (phrase.researchRewardSlots) {
        return resolveResearchRewardSlots(
            phrase.researchRewardSlots,
            state.researchTrees,
            state.equipment,
            `${def.missionId}:${ctx.playerId}:${researchCount(state.researchTrees)}`,
            { accountKnowledge: knowledge, researchNodeLevels: state.researchNodeLevels },
        );
    }
    const computed = def.getPostMissionChoiceOptions?.({
        choiceId: phrase.choiceId,
        equippedItemIds: state.equipment,
        playerResearchTrees: state.researchTrees,
        playerId: ctx.playerId,
    });
    return computed ?? phrase.options;
}

/** Equip `itemId`, unequipping anything that shares one of its slots (matches the live story). */
function equipReplacingSlots(equipment: string[], itemId: string): string[] {
    const slots = new Set(getItemDef(itemId)?.slots ?? []);
    const kept = equipment.filter((id) => id !== itemId && !getItemDef(id)?.slots.some((s) => slots.has(s)));
    return [...kept, itemId];
}

/** Add one level of a node (mirrors backend `Character::addResearchLevel`). False when already maxed. */
function grantResearchLevel(
    state: ChapterSkipCharacterState,
    treeId: string,
    nodeId: string,
    source: ResearchSource,
): ChapterSkipCharacterState | null {
    const node = getResearchNode(treeId, nodeId);
    const maxLevels = node ? getNodeMaxLevels(node) : 1;
    const level = getNodeLevel(treeId, nodeId, state.researchTrees, state.researchNodeLevels);
    if (level >= maxLevels) return null;
    const sources = getNodeResearchSources(
        treeId,
        nodeId,
        state.researchTrees,
        state.researchNodeLevels,
        state.researchSources,
    );
    const list = state.researchTrees[treeId] ?? [];
    return {
        ...state,
        researchTrees: { ...state.researchTrees, [treeId]: list.includes(nodeId) ? list : [...list, nodeId] },
        researchNodeLevels: {
            ...state.researchNodeLevels,
            [treeId]: { ...state.researchNodeLevels[treeId], [nodeId]: level + 1 },
        },
        researchSources: {
            ...state.researchSources,
            [treeId]: { ...state.researchSources[treeId], [nodeId]: [...sources, source] },
        },
    };
}

/** Remove one level of a node, preferring to drop a QuestReward level. */
function removeResearchLevel(state: ChapterSkipCharacterState, treeId: string, nodeId: string): ChapterSkipCharacterState {
    const level = getNodeLevel(treeId, nodeId, state.researchTrees, state.researchNodeLevels);
    if (level <= 0) return state;
    const sources = getNodeResearchSources(
        treeId,
        nodeId,
        state.researchTrees,
        state.researchNodeLevels,
        state.researchSources,
    );
    const dropAt = sources.lastIndexOf(ResearchSource.QuestReward);
    sources.splice(dropAt >= 0 ? dropAt : sources.length - 1, 1);

    const treeLevels = { ...state.researchNodeLevels[treeId] };
    const treeSources = { ...state.researchSources[treeId] };
    let treeList = state.researchTrees[treeId] ?? [];
    if (level - 1 <= 0) {
        delete treeLevels[nodeId];
        delete treeSources[nodeId];
        treeList = treeList.filter((id) => id !== nodeId);
    } else {
        treeLevels[nodeId] = level - 1;
        treeSources[nodeId] = sources;
    }
    const withTree = <T>(map: Record<string, T>, value: T, empty: boolean): Record<string, T> => {
        const next = { ...map };
        if (empty) delete next[treeId];
        else next[treeId] = value;
        return next;
    };
    return {
        ...state,
        researchTrees: withTree(state.researchTrees, treeList, treeList.length === 0),
        researchNodeLevels: withTree(state.researchNodeLevels, treeLevels, Object.keys(treeLevels).length === 0),
        researchSources: withTree(state.researchSources, treeSources, Object.keys(treeSources).length === 0),
    };
}

/**
 * "Replace" semantics: undo the research that earlier results for `missionIds` granted
 * (one level per recorded reward), so re-skipping a chapter does not stack rewards.
 */
export function stripChapterResearchRewards(
    state: ChapterSkipCharacterState,
    results: readonly MissionResult[],
    missionIds: readonly string[],
): ChapterSkipCharacterState {
    const ids = new Set(missionIds);
    let next = state;
    for (const result of results) {
        if (!ids.has(result.missionId)) continue;
        for (const reward of getResolvedMissionResearchRewards(result)) {
            next = removeResearchLevel(next, reward.treeId, reward.nodeId);
        }
    }
    return next;
}

interface MissionAccumulator {
    itemIds: string[];
    researchRewards: MissionResearchRewardEntry[];
    resourceDelta: Partial<Record<CampaignResourceKey, number>>;
}

function applyAction(
    state: ChapterSkipCharacterState,
    action: StoryChoiceAction | undefined,
    acc: MissionAccumulator,
): ChapterSkipCharacterState {
    const grant = (s: ChapterSkipCharacterState, treeId: string, nodeId: string) => {
        const granted = grantResearchLevel(s, treeId, nodeId, ResearchSource.QuestReward);
        if (!granted) return s;
        acc.researchRewards.push({ treeId, nodeId });
        return granted;
    };
    switch (action?.type) {
        case 'equip_item': {
            acc.itemIds.push(action.itemId);
            const equipped = { ...state, equipment: equipReplacingSlots(state.equipment, action.itemId) };
            const extra = action.alsoGrantResearch;
            return extra ? grant(equipped, extra.treeId, extra.nodeId) : equipped;
        }
        case 'grant_research_to_player':
            return grant(state, action.treeId, action.nodeId);
        case 'grant_research_conditional': {
            const match = action.candidates.find((c) => state.equipment.includes(c.equippedItemId));
            return match ? grant(state, match.treeId, match.nodeId) : state;
        }
        case 'grant_resources':
            for (const key of MISSION_BONUS_RESOURCE_KEYS) {
                const amount = action[key];
                if (amount) acc.resourceDelta[key] = (acc.resourceDelta[key] ?? 0) + amount;
            }
            return state;
        default:
            // heal_wounds etc. only affect a live match.
            return state;
    }
}

/** Admin skip is offered only for `adminSkippable` chapters, and never for `adminOnly` ones. */
export function isChapterSkippable(chapter: CampaignChapterDef): boolean {
    return !!chapter.adminSkippable && !chapter.adminOnly;
}

interface ReplayResult {
    next: ChapterSkipStep | null;
    plan: ChapterSkipPlan;
}

function replay(
    chapter: CampaignChapterDef,
    start: ChapterSkipCharacterState,
    picks: readonly ChapterSkipPick[],
    ctx: ChapterSkipContext,
): ReplayResult {
    if (chapter.adminOnly) throw new Error(`Chapter skip: ${chapter.id} is admin-only and cannot be skipped`);
    const missionsWithChoices = chapter.missionIds.filter((id) => choicePhrases(missionDef(id)).length > 0);
    let state = start;
    let knowledge = { ...ctx.accountKnowledge };
    const knowledgeKeys: string[] = [];
    const missionResults: MissionResult[] = [];
    let pickIndex = 0;

    for (const missionId of chapter.missionIds) {
        const def = missionDef(missionId);
        const acc: MissionAccumulator = { itemIds: [], researchRewards: [], resourceDelta: {} };
        for (const { stage, phrase } of choicePhrases(def)) {
            const options = resolveOptions(def, stage, phrase, state, ctx, knowledge);
            const pick = picks[pickIndex];
            if (!pick) {
                return {
                    next: {
                        missionId,
                        missionName: def.name ?? missionId,
                        choiceId: phrase.choiceId,
                        options,
                        missionStepIndex: missionsWithChoices.indexOf(missionId),
                        missionStepCount: missionsWithChoices.length,
                    },
                    plan: { state, missionResults, knowledgeKeys },
                };
            }
            const option = options.find((o) => o.id === pick.optionId && !o.disabledLabel);
            if (pick.missionId !== missionId || pick.choiceId !== phrase.choiceId || !option) {
                throw new Error(
                    `Chapter skip: pick ${pick.missionId}/${pick.choiceId}/${pick.optionId} is not offered at ${missionId}/${phrase.choiceId}`,
                );
            }
            state = applyAction(state, option.action, acc);
            pickIndex++;
        }

        const rewards = def.completionRewards;
        const resourceDelta = { ...rewards?.resourceDelta };
        for (const [key, amount] of Object.entries(acc.resourceDelta) as [CampaignResourceKey, number][]) {
            resourceDelta[key] = (resourceDelta[key] ?? 0) + amount;
        }
        const itemIds = [
            ...new Set([...acc.itemIds, ...resolveUnlockedTierItemIds(rewards?.unlockItemTiers, def.campaignId)]),
        ];
        missionResults.push({
            missionId,
            result: 'victory',
            adminGranted: true,
            ...(Object.keys(resourceDelta).length > 0 && { resourceDelta }),
            ...(itemIds.length > 0 && { itemIds }),
            ...(acc.researchRewards.length > 0 && { researchRewards: acc.researchRewards }),
        });
        for (const key of rewards?.knowledgeKeys ?? []) {
            if (!knowledgeKeys.includes(key)) knowledgeKeys.push(key);
            knowledge = { ...knowledge, [key]: knowledge[key] ?? {} };
        }
    }

    if (pickIndex < picks.length) throw new Error('Chapter skip: more picks than choices');
    return { next: null, plan: { state, missionResults, knowledgeKeys } };
}

/** The next unanswered wizard step after `picks`, or null once every choice is answered. */
export function getNextChapterSkipStep(
    chapter: CampaignChapterDef,
    start: ChapterSkipCharacterState,
    picks: readonly ChapterSkipPick[],
    ctx: ChapterSkipContext,
): ChapterSkipStep | null {
    return replay(chapter, start, picks, ctx).next;
}

/** Final state and results once every choice is answered. Throws if any pick is missing or invalid. */
export function buildChapterSkipPlan(
    chapter: CampaignChapterDef,
    start: ChapterSkipCharacterState,
    picks: readonly ChapterSkipPick[],
    ctx: ChapterSkipContext,
): ChapterSkipPlan {
    const { next, plan } = replay(chapter, start, picks, ctx);
    if (next) throw new Error(`Chapter skip: no pick for ${next.missionId}/${next.choiceId}`);
    return plan;
}
