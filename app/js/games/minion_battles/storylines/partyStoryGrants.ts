/**
 * Party-wide Campaign Reward helpers for post-mission choices (`alsoGrantToOthers`).
 */

import { SPECTATOR_ID, isControlEnemy } from '../state';
import { MISSION_BONUS_RESOURCE_KEYS, type MissionBonusResourceDelta } from '../../../campaignResources';
import type { StoryChoiceActionGrantResources, StoryChoiceOptionRow } from './storyTypes';

export type ResourceDelta = MissionBonusResourceDelta;

export function isGrantResourcesAction(
    action: { type: string } | undefined,
): action is StoryChoiceActionGrantResources {
    return !!action && action.type === 'grant_resources';
}

export function choiceOptionsHaveAlsoGrantToOthers(options: StoryChoiceOptionRow[]): boolean {
    return options.some(
        (o) => isGrantResourcesAction(o.action) && o.action.alsoGrantToOthers != null,
    );
}

export function addResourceDelta(into: ResourceDelta, add: ResourceDelta | undefined): void {
    if (!add) return;
    for (const key of MISSION_BONUS_RESOURCE_KEYS) {
        const amount = add[key];
        if (amount != null) into[key] = (into[key] ?? 0) + amount;
    }
}

/** Non-spectator, non-NPC-controller player ids. */
export function eligibleStoryRewardPlayerIds(
    characterSelections: Record<string, string> | undefined,
): string[] {
    if (!characterSelections) return [];
    return Object.entries(characterSelections)
        .filter(([, sel]) => sel !== SPECTATOR_ID && !isControlEnemy(sel))
        .map(([pid]) => pid);
}

export function allEligiblePlayersHaveChoice(
    choiceId: string,
    eligiblePlayerIds: string[],
    playerStoryChoices: Record<string, Record<string, string>> | undefined,
): boolean {
    const choices = playerStoryChoices ?? {};
    return eligiblePlayerIds.every((pid) => typeof choices[pid]?.[choiceId] === 'string');
}

/**
 * Sum `alsoGrantToOthers` from every *other* player's selected option for this choiceId.
 */
export function sumAlsoGrantToOthersFromParty(
    myPlayerId: string,
    choiceId: string,
    options: StoryChoiceOptionRow[],
    eligiblePlayerIds: string[],
    playerStoryChoices: Record<string, Record<string, string>> | undefined,
): ResourceDelta {
    const choices = playerStoryChoices ?? {};
    const acc: ResourceDelta = {};
    for (const pid of eligiblePlayerIds) {
        if (pid === myPlayerId) continue;
        const optionId = choices[pid]?.[choiceId];
        if (!optionId) continue;
        const option = options.find((o) => o.id === optionId);
        if (!isGrantResourcesAction(option?.action)) continue;
        addResourceDelta(acc, option.action.alsoGrantToOthers);
    }
    return acc;
}
