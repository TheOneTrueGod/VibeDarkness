/**
 * Resolve QuestDef MissionSlotSpecs into ResolvedMissionRef[] once per run (prep → active).
 * Same runSeed + slot index must yield deterministic results when generators exist.
 *
 * v1: fixed slots copy missionId; random_story picks from the bag; random_battle still stubbed.
 */

import { pickRandomStoryMission, RANDOM_STORY_GENERATOR_ID } from './randomStoryResolve';
import type {
    MissionSlotSpec,
    QuestDef,
    RandomBattleSlotParams,
    RandomStorySlotParams,
    ResolvedMissionRef,
} from './questTypes';

export type QuestSlotResolveContext = {
    runSeed: number;
    /** Set by resolveQuestSlots when iterating; optional for single-slot calls. */
    slotIndex?: number;
    /**
     * Deterministic seed for this slot (derived from runSeed + slotIndex).
     * Random generators must use this (not raw runSeed alone) when they exist.
     */
    slotSeed?: number;
};

/** Thrown when a random_* slot kind has no real generator yet. */
export class QuestSlotResolverNotImplementedError extends Error {
    readonly slotKind: 'random_battle' | 'random_story';
    readonly slotIndex: number | undefined;
    readonly params: RandomBattleSlotParams | RandomStorySlotParams;

    constructor(
        slotKind: 'random_battle' | 'random_story',
        params: RandomBattleSlotParams | RandomStorySlotParams,
        slotIndex?: number,
    ) {
        const indexPart = slotIndex !== undefined ? ` at slot index ${slotIndex}` : '';
        super(`Quest slot resolver not implemented for kind "${slotKind}"${indexPart}`);
        this.name = 'QuestSlotResolverNotImplementedError';
        this.slotKind = slotKind;
        this.slotIndex = slotIndex;
        this.params = params;
    }
}

export type MissionSlotResolver = (
    spec: MissionSlotSpec,
    ctx: QuestSlotResolveContext,
) => ResolvedMissionRef;

/** Deterministic per-slot seed for future random generators (runSeed + slot index). */
export function slotSeedFor(runSeed: number, slotIndex: number): number {
    // Mix so different indices diverge even when runSeed is small.
    return (runSeed >>> 0) + Math.imul(slotIndex + 1, 0x9e3779b9);
}

function resolveFixed(spec: Extract<MissionSlotSpec, { kind: 'fixed' }>): ResolvedMissionRef {
    return { kind: 'fixed', missionId: spec.missionId };
}

function resolveRandomBattleStub(
    spec: Extract<MissionSlotSpec, { kind: 'random_battle' }>,
    ctx: QuestSlotResolveContext,
): never {
    throw new QuestSlotResolverNotImplementedError('random_battle', spec.params, ctx.slotIndex);
}

function resolveRandomStory(
    spec: Extract<MissionSlotSpec, { kind: 'random_story' }>,
    ctx: QuestSlotResolveContext,
): ResolvedMissionRef {
    const slotSeed = ctx.slotSeed ?? slotSeedFor(ctx.runSeed, ctx.slotIndex ?? 0);
    const picked = pickRandomStoryMission(spec.params, slotSeed);
    return {
        kind: 'generated',
        missionId: picked.missionId,
        generatorId: RANDOM_STORY_GENERATOR_ID,
        seed: slotSeed,
        params: spec.params,
    };
}

/** Resolve a single MissionSlotSpec. */
export function resolveMissionSlot(
    spec: MissionSlotSpec,
    ctx: QuestSlotResolveContext,
): ResolvedMissionRef {
    switch (spec.kind) {
        case 'fixed':
            return resolveFixed(spec);
        case 'random_battle':
            return resolveRandomBattleStub(spec, ctx);
        case 'random_story':
            return resolveRandomStory(spec, ctx);
        default: {
            const _exhaustive: never = spec;
            throw new Error(`Unknown mission slot kind: ${JSON.stringify(_exhaustive)}`);
        }
    }
}

/**
 * Resolve all slots on a QuestDef for a run.
 * Uses runSeed (+ slot index) so random resolvers stay deterministic.
 */
export function resolveQuestSlots(
    quest: QuestDef,
    ctx: Pick<QuestSlotResolveContext, 'runSeed'>,
): ResolvedMissionRef[] {
    return quest.slots.map((spec, slotIndex) =>
        resolveMissionSlot(spec, {
            runSeed: ctx.runSeed,
            slotIndex,
            slotSeed: slotSeedFor(ctx.runSeed, slotIndex),
        }),
    );
}
