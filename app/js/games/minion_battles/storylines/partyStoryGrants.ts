/**
 * Party-wide Campaign Reward helpers for post-mission choices (`alsoGrantToOthers`).
 */

import { SPECTATOR_ID, isControlEnemy } from '../state';
import type { StoryChoiceActionGrantResources, StoryChoiceOptionRow } from './storyTypes';

export type ResourceDelta = Partial<Record<'food' | 'metal' | 'crystals', number>>;

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
    if (add.food != null) into.food = (into.food ?? 0) + add.food;
    if (add.metal != null) into.metal = (into.metal ?? 0) + add.metal;
    if (add.crystals != null) into.crystals = (into.crystals ?? 0) + add.crystals;
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
