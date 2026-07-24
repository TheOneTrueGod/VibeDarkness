import React, { useMemo } from 'react';
import type { ChoicePhrase, StoryChoiceOptionRow } from '../../../storylines/storyTypes';
import ResourcePill, { campaignResourceGains } from '../../../../../components/ResourcePill';
import StoryPanelCard from './StoryPanelCard';
import { isGrantResources } from './preMissionStoryTypeGuards';
import { TestIds, storyChoiceTestId } from '../../../../../testing/testIds';
import { isResearchNodeBlockedByOwnershipOrExclusivity } from '../../../../../researchTrees/evaluator';

/** Badge / skip copy — matches post-mission reward skip. */
export const PRE_MISSION_SKIP_LABEL = 'Leave nothing but footprints';
export const PRE_MISSION_SKIP_DESCRIPTION = 'Take no upgrade and move on.';
export const PRE_MISSION_SKIP_OPTION_ID = 'skip';

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

    return (
        <StoryPanelCard maxWidthClassName="max-w-xl sm:max-w-2xl md:max-w-3xl">
            {amSpectator ? (
                <div className="flex flex-col items-center justify-center space-y-3 text-center min-h-0">
                    <p className="text-muted mb-4">Spectators do not make choices.</p>
                    <button
                        type="button"
                        data-testid={TestIds.storyNext}
                        onClick={onAdvance}
                        className="px-6 py-2 bg-primary text-white font-semibold rounded-lg hover:opacity-90"
                    >
                        Next
                    </button>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center gap-3 w-full min-w-0">
                    {showFootprintsSkip ? (
                        <button
                            type="button"
                            data-testid={storyChoiceTestId(PRE_MISSION_SKIP_OPTION_ID)}
                            onClick={() => onChoose(phrase.choiceId, PRE_MISSION_SKIP_OPTION_ID, undefined)}
                            className="block w-full min-w-0 text-center px-4 sm:px-6 py-4 rounded-lg border-2 border-border-custom bg-surface/30 hover:border-zinc-400 hover:bg-surface/50 transition-colors text-lg text-zinc-300 hover:text-zinc-200 flex flex-col gap-2 items-center justify-center"
                        >
                            <span className="break-words font-medium">{PRE_MISSION_SKIP_LABEL}</span>
                            <span className="text-sm leading-snug">{PRE_MISSION_SKIP_DESCRIPTION}</span>
                        </button>
                    ) : (
                        visibleOptions.map((opt) => (
                            <button
                                key={opt.id}
                                type="button"
                                data-testid={storyChoiceTestId(opt.id)}
                                onClick={() => onChoose(phrase.choiceId, opt.id, opt)}
                                className="block w-full min-w-0 text-center px-4 sm:px-6 py-4 rounded-lg border-2 border-border-custom bg-surface hover:border-primary hover:bg-surface-light/80 transition-colors text-lg text-white flex flex-col gap-2 items-center justify-center"
                            >
                                <span className="break-words">{opt.label}</span>
                                {isGrantResources(opt.action) && (
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                        {campaignResourceGains({
                                            food: opt.action.food,
                                            metal: opt.action.metal,
                                            crystals: opt.action.crystals,
                                        }).map(({ resource, count }) => (
                                            <ResourcePill key={`${opt.id}-${resource}`} resource={resource} count={count} />
                                        ))}
                                    </div>
                                )}
                            </button>
                        ))
                    )}
                </div>
            )}
        </StoryPanelCard>
    );
}
