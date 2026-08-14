import React, { useMemo } from 'react';
import type { ChoicePhrase, StoryChoiceOptionRow } from '../../../storylines/storyTypes';
import ResourcePill, { campaignResourceGains } from '../../../../../components/ResourcePill';
import StoryChoiceGrid, {
    STORY_CHOICE_CELL_BUTTON_BASE,
    STORY_CHOICE_CELL_BUTTON_PRIMARY,
    STORY_CHOICE_CELL_BUTTON_SKIP,
} from '../../components/battleUiSlots/StoryChoiceGrid';
import { isGrantResources } from './preMissionStoryTypeGuards';
import { TestIds, storyChoiceTestId } from '../../../../../testing/testIds';
import { isResearchNodeBlockedByOwnershipOrExclusivity } from '../../../../../researchTrees/evaluator';
import {
    STORY_CHOICE_SKIP_DESCRIPTION,
    STORY_CHOICE_SKIP_LABEL,
    STORY_CHOICE_SKIP_OPTION_ID,
    arrangeStoryChoiceGridSlots,
    isStoryChoiceSkipOption,
} from './storyChoiceGrid';

export {
    PRE_MISSION_SKIP_LABEL,
    PRE_MISSION_SKIP_DESCRIPTION,
    PRE_MISSION_SKIP_OPTION_ID,
} from './storyChoiceGrid';

interface ChoicePhrasePanelProps {
    phrase: ChoicePhrase;
    amSpectator: boolean;
    /** Local player's research map — used to hide grants blocked by ownership / exclusivity. */
    playerResearchTrees?: Record<string, string[]>;
    onAdvance: () => void;
    onChoose: (
        choiceId: string,
        optionId: string,
        option?: { action?: { type: string; itemId?: string } },
    ) => void;
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
        if (!isGrantResearchOption(opt)) return true;
        const action = opt.action;
        if (action.type !== 'grant_research_to_player') return true;
        return !isResearchNodeBlockedByOwnershipOrExclusivity(
            action.treeId,
            action.nodeId,
            playerResearchTrees,
        );
    });
}

function syntheticFootprintsSkipOption(): StoryChoiceOptionRow {
    return {
        id: STORY_CHOICE_SKIP_OPTION_ID,
        label: STORY_CHOICE_SKIP_LABEL,
        loreDescription: STORY_CHOICE_SKIP_DESCRIPTION,
        action: { type: 'grant_resources' },
    };
}

export default function ChoicePhrasePanel({
    phrase,
    amSpectator,
    playerResearchTrees,
    onAdvance,
    onChoose,
}: ChoicePhrasePanelProps) {
    const visibleOptions = useMemo(
        () => filterChoiceOptionsByResearch(phrase.options, playerResearchTrees),
        [phrase.options, playerResearchTrees],
    );
    const showFootprintsSkip =
        visibleOptions.length === 0 &&
        phrase.options.length > 0 &&
        phrase.options.every(isGrantResearchOption);

    const gridSlots = useMemo(() => {
        const syntheticSkip = showFootprintsSkip ? syntheticFootprintsSkipOption() : null;
        return arrangeStoryChoiceGridSlots(visibleOptions, syntheticSkip);
    }, [showFootprintsSkip, visibleOptions]);

    if (amSpectator) {
        return (
            <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-muted text-sm">Spectators do not make choices.</p>
                <button
                    type="button"
                    data-testid={TestIds.storyNext}
                    onClick={onAdvance}
                    className="rounded-lg bg-primary px-6 py-2 font-semibold text-white hover:opacity-90"
                >
                    Next
                </button>
            </div>
        );
    }

    return (
        <StoryChoiceGrid
            cells={gridSlots.map((opt) => {
                if (!opt) return null;
                const isSkip = isStoryChoiceSkipOption(opt);
                const buttonClass = `${STORY_CHOICE_CELL_BUTTON_BASE} ${
                    isSkip ? STORY_CHOICE_CELL_BUTTON_SKIP : STORY_CHOICE_CELL_BUTTON_PRIMARY
                }`;
                const title = opt.loreTitle ?? opt.label;
                const description = opt.loreDescription;
                return (
                    <button
                        key={opt.id}
                        type="button"
                        data-testid={storyChoiceTestId(opt.id)}
                        onClick={() =>
                            onChoose(
                                phrase.choiceId,
                                opt.id,
                                isSkip ? undefined : opt,
                            )
                        }
                        className={buttonClass}
                    >
                        <span className="line-clamp-2 text-xs font-medium leading-snug sm:text-sm">{title}</span>
                        {description ? (
                            <span className="line-clamp-2 text-[10px] leading-snug text-zinc-400 sm:text-xs">
                                {description}
                            </span>
                        ) : null}
                        {!isSkip && isGrantResources(opt.action) ? (
                            <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
                                {campaignResourceGains({
                                    food: opt.action.food,
                                    metal: opt.action.metal,
                                    crystals: opt.action.crystals,
                                }).map(({ resource, count }) => (
                                    <ResourcePill key={`${opt.id}-${resource}`} resource={resource} count={count} />
                                ))}
                            </div>
                        ) : null}
                    </button>
                );
            })}
        />
    );
}
