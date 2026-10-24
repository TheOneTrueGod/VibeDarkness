import { sumLatestMissionResourceDeltas } from '../../../campaignResources';
import { applyPassiveBonusToBase, computePassiveBonuses } from '../../../researchTrees/passiveBonuses';
import { PassiveStatKey, type ResearchNodeLevels } from '../../../researchTrees/types';
import { HUNGER_RESOURCE_KEY } from '../storylines/matchHunger';
import type { QuestResult } from '../storylines/questTypes';
import type { MissionResult } from '../../../types';

/** Base max Hunger for every campaign character before research. */
export const DEFAULT_CHARACTER_MAX_HUNGER = 100;

/**
 * Fraction of max Hunger a newly created character starts with (the bar starts 30% full).
 * Must match PHP `Character::NEW_CHARACTER_STARTING_HUNGER_FRACTION`.
 */
export const NEW_CHARACTER_STARTING_HUNGER_FRACTION = 0.3;

export type CharacterHungerSource = {
    campaignId: string;
    missionResults: Record<string, MissionResult[]>;
    questResults: Record<string, QuestResult[]>;
    researchTrees: Record<string, string[]>;
    researchNodeLevels: ResearchNodeLevels;
    /** Fraction of max Hunger the character started with; absent (legacy characters) means full. */
    startingHungerFraction?: number;
};

type HungerDeltaSource = Pick<CharacterHungerSource, 'campaignId' | 'missionResults' | 'questResults'>;

/**
 * Effective max Hunger: default plus researched {@link PassiveStatKey.MaxHunger} bonuses.
 */
export function getCharacterMaxHunger(
    researchTrees: Record<string, string[]> | undefined,
    researchNodeLevels?: ResearchNodeLevels,
): number {
    const bonuses = computePassiveBonuses(researchTrees, researchNodeLevels);
    return Math.max(
        0,
        applyPassiveBonusToBase(DEFAULT_CHARACTER_MAX_HUNGER, bonuses[PassiveStatKey.MaxHunger]),
    );
}

/**
 * Net signed Hunger change from this character's mission and quest results (normally <= 0).
 * Latest result per mission is summed; quest results only count *losses* (negative deltas).
 * Must match PHP `Character::getHungerDelta()`.
 * Pass `excludeMissionId` when a replay is about to replace that mission's delta.
 */
export function getCharacterHungerDelta(
    character: HungerDeltaSource,
    options?: { excludeMissionId?: string },
): number {
    const list = character.missionResults[character.campaignId] ?? [];
    const missionList = options?.excludeMissionId
        ? list.filter((r) => r.missionId !== options.excludeMissionId)
        : list;
    let total = sumLatestMissionResourceDeltas(missionList)[HUNGER_RESOURCE_KEY];
    const quests = character.questResults[character.campaignId] ?? [];
    for (const quest of quests) {
        const n = quest.resourceDelta?.[HUNGER_RESOURCE_KEY];
        if (n != null && n < 0) {
            total += n;
        }
    }
    return total;
}

/** Hunger a character starts with: `startFraction` of max Hunger (default full), rounded to a whole point. */
export function getStartingHunger(maxHunger: number, startFraction = 1): number {
    const max = Number.isFinite(maxHunger) ? Math.max(0, maxHunger) : 0;
    const fraction = Number.isFinite(startFraction) ? Math.max(0, Math.min(1, startFraction)) : 1;
    return Math.round(max * fraction);
}

/** Current Hunger from a signed delta: `clamp(start + delta, 0, maxHunger)`; start is full unless `startFraction` says otherwise. */
export function hungerFromDelta(maxHunger: number, hungerDelta: number, startFraction = 1): number {
    const max = Number.isFinite(maxHunger) ? Math.max(0, maxHunger) : 0;
    const delta = Number.isFinite(hungerDelta) ? hungerDelta : 0;
    return Math.max(0, Math.min(max, getStartingHunger(max, startFraction) + delta));
}

/** Current Hunger (0 = starving, max = well fed), clamped to [0, maxHunger]. */
export function getCharacterHunger(
    character: CharacterHungerSource,
    options?: { excludeMissionId?: string },
): number {
    const max = getCharacterMaxHunger(character.researchTrees, character.researchNodeLevels);
    return hungerFromDelta(max, getCharacterHungerDelta(character, options), character.startingHungerFraction);
}

/** Hunger as a 0..1 fraction of max Hunger. Zero when max Hunger is not positive. */
export function getHungerFraction(hunger: number, maxHunger: number): number {
    if (!Number.isFinite(hunger) || !Number.isFinite(maxHunger) || maxHunger <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(1, hunger / maxHunger));
}

/**
 * Match-end Hunger loss (a positive number) capped to the Hunger the character still has,
 * so Hunger never drops below 0.
 */
export function clampCharacterMatchHungerLoss(
    character: CharacterHungerSource,
    missionId: string,
    loss: number,
): number {
    if (!Number.isFinite(loss) || loss <= 0) {
        return 0;
    }
    const current = getCharacterHunger(character, { excludeMissionId: missionId });
    return Math.min(Math.floor(loss), Math.max(0, Math.floor(current)));
}
