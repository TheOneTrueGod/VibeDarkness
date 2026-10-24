/**
 * Shared rules for which options a story `choice` phrase shows, used by the live story panels
 * and the admin Skip Chapter wizard (`chapterSkip.ts`), so both offer the same rows.
 */
import type { CampaignResourceKey } from '../../../types';
import type { StoryChoiceAction, StoryChoiceOptionRow } from './storyTypes';
import { isResearchNodeBlockedByOwnershipOrExclusivity } from '../../../researchTrees/evaluator';

export const STORY_CHOICE_SKIP_OPTION_ID = 'skip';
export const STORY_CHOICE_SKIP_LABEL = 'Leave nothing but footprints';
export const STORY_CHOICE_SKIP_DESCRIPTION = 'Take no upgrade and move on.';

const SKIP_LABEL_PATTERNS = [
    /^leave nothing but footprints$/i,
    /^leave only footprints$/i,
    /^do nothing$/i,
    /^cancel$/i,
];

type ChoiceLike = Pick<StoryChoiceOptionRow, 'id' | 'label' | 'loreTitle'>;

export function isStoryChoiceSkipOption(option: ChoiceLike): boolean {
    if (option.id === STORY_CHOICE_SKIP_OPTION_ID) return true;
    const heading = (option.loreTitle ?? option.label).trim();
    return SKIP_LABEL_PATTERNS.some((pattern) => pattern.test(heading));
}

/** The "take nothing" row; its empty `grant_resources` action grants nothing. */
export function createStoryChoiceSkipOption(): StoryChoiceOptionRow {
    return {
        id: STORY_CHOICE_SKIP_OPTION_ID,
        label: STORY_CHOICE_SKIP_LABEL,
        loreTitle: STORY_CHOICE_SKIP_LABEL,
        loreDescription: STORY_CHOICE_SKIP_DESCRIPTION,
        action: { type: 'grant_resources' },
    };
}

function isGrantResearchOption(opt: StoryChoiceOptionRow): boolean {
    return opt.action?.type === 'grant_research_to_player';
}

/** Options still available given researched trees (drops owned / exclusive conflicts). */
export function filterChoiceOptionsByResearch(
    options: readonly StoryChoiceOptionRow[],
    playerResearchTrees: Record<string, string[]> | undefined,
): StoryChoiceOptionRow[] {
    return options.filter((opt) => {
        const action = opt.action;
        if (action?.type !== 'grant_research_to_player') return true;
        return !isResearchNodeBlockedByOwnershipOrExclusivity(action.treeId, action.nodeId, playerResearchTrees);
    });
}

/**
 * Pre-mission choices: research grants the player cannot take are hidden, and the skip row is
 * added only when that hides every option of an all-research choice.
 */
export function needsPreMissionSkipOption(
    phraseOptions: readonly StoryChoiceOptionRow[],
    visibleOptions: readonly StoryChoiceOptionRow[],
): boolean {
    return visibleOptions.length === 0 && phraseOptions.length > 0 && phraseOptions.every(isGrantResearchOption);
}

/** Post-mission choices always offer a way to take nothing. */
export function withPostMissionSkipOption(options: readonly StoryChoiceOptionRow[]): StoryChoiceOptionRow[] {
    return options.some(isStoryChoiceSkipOption) ? [...options] : [...options, createStoryChoiceSkipOption()];
}

/**
 * Resources a choice action hands the player, for its reward pills: `grant_resources` amounts and
 * `recover_hunger` as a positive Hunger change. Empty for actions without a resource reward.
 */
export function storyChoiceActionResourceDelta(
    action: StoryChoiceAction | undefined,
): Partial<Record<CampaignResourceKey, number>> {
    if (action?.type === 'grant_resources') {
        return { food: action.food, metal: action.metal, crystals: action.crystals };
    }
    if (action?.type === 'recover_hunger') {
        return { hunger: action.amount };
    }
    return {};
}
