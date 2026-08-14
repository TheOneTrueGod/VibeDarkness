import React, { useMemo } from 'react';
import { Star } from 'lucide-react';
import type { ChoicePhrase, StoryChoiceAction, StoryChoiceOptionRow } from '../../../storylines/storyTypes';
import ResourcePill, { campaignResourceGains } from '../../../../../components/ResourcePill';
import ResearchRewardTinyChip from '../../../../../components/ResearchRewardTinyChip';
import StoryChoiceGrid, {
    STORY_CHOICE_CELL_BUTTON_BASE,
    STORY_CHOICE_CELL_BUTTON_DISABLED,
    STORY_CHOICE_CELL_BUTTON_PRIMARY,
    STORY_CHOICE_CELL_BUTTON_SKIP,
} from '../../components/battleUiSlots/StoryChoiceGrid';
import { storyChoiceTestId } from '../../../../../testing/testIds';
import type { ResearchNodeDef } from '../../../../../researchTrees/types';
import {
    STORY_CHOICE_SKIP_DESCRIPTION,
    STORY_CHOICE_SKIP_LABEL,
    STORY_CHOICE_SKIP_OPTION_ID,
    arrangeStoryChoiceGridSlots,
    isStoryChoiceSkipOption,
} from './storyChoiceGrid';
import { isGrantResources } from './preMissionStoryTypeGuards';

/** Badge on reward options flagged {@link StoryChoiceOptionRow.forYou}. */
export const FOR_YOU_BADGE_LABEL = 'For you';

export interface ResolvedPostMissionChoiceOption {
    action?: StoryChoiceAction;
    disabledLabel?: string;
    researchReward?: {
        treeId: string;
        nodeId: string;
        rewardId: string;
        node: ResearchNodeDef;
    };
    disabled: boolean;
}

interface PostMissionChoicePanelProps {
    phrase: ChoicePhrase;
    options: readonly StoryChoiceOptionRow[];
    amSpectator: boolean;
    waitingForPartyChoiceId: string | null;
    resolveChoiceOption: (option: StoryChoiceOptionRow) => ResolvedPostMissionChoiceOption;
    onChoose: (
        choiceId: string,
        optionId: string,
        option?: StoryChoiceOptionRow,
        resolvedOption?: ResolvedPostMissionChoiceOption,
    ) => void;
    onSpectatorComplete: () => void;
}

function syntheticPostMissionSkipOption(): StoryChoiceOptionRow {
    return {
        id: STORY_CHOICE_SKIP_OPTION_ID,
        label: STORY_CHOICE_SKIP_LABEL,
        loreTitle: STORY_CHOICE_SKIP_LABEL,
        loreDescription: STORY_CHOICE_SKIP_DESCRIPTION,
        action: { type: 'grant_resources' },
    };
}

export default function PostMissionChoicePanel({
    phrase,
    options,
    amSpectator,
    waitingForPartyChoiceId,
    resolveChoiceOption,
    onChoose,
    onSpectatorComplete,
}: PostMissionChoicePanelProps) {
    const gridSlots = useMemo(
        () => arrangeStoryChoiceGridSlots(options, syntheticPostMissionSkipOption()),
        [options],
    );

    if (amSpectator) {
        return (
            <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-3 text-center">
                <p className="text-muted text-sm">Spectators do not receive rewards.</p>
                <button
                    type="button"
                    onClick={onSpectatorComplete}
                    className="rounded-lg bg-primary px-6 py-2 font-semibold text-white hover:opacity-90"
                >
                    Next
                </button>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 w-full flex-col gap-1">
            {waitingForPartyChoiceId ? (
                <p className="shrink-0 text-center text-xs text-amber-200/90 sm:text-sm">
                    Waiting for other players to choose…
                </p>
            ) : null}
            <div className="min-h-0 flex-1">
                <StoryChoiceGrid
                    cells={gridSlots.map((opt) => {
                        if (!opt) return null;

                        const isSkip = isStoryChoiceSkipOption(opt);
                        const resolvedOption = isSkip
                            ? { disabled: false }
                            : resolveChoiceOption(opt);
                        const title = opt.loreTitle ?? opt.label;
                        const buttonClass = `${STORY_CHOICE_CELL_BUTTON_BASE} ${
                            resolvedOption.disabled
                                ? STORY_CHOICE_CELL_BUTTON_DISABLED
                                : isSkip
                                  ? STORY_CHOICE_CELL_BUTTON_SKIP
                                  : STORY_CHOICE_CELL_BUTTON_PRIMARY
                        }`;

                        return (
                            <button
                                key={opt.id}
                                type="button"
                                data-testid={storyChoiceTestId(opt.id)}
                                disabled={resolvedOption.disabled || !!waitingForPartyChoiceId}
                                onClick={() =>
                                    onChoose(
                                        phrase.choiceId,
                                        opt.id,
                                        isSkip ? undefined : opt,
                                        resolvedOption,
                                    )
                                }
                                className={buttonClass}
                            >
                                <div className="flex w-full min-w-0 items-center justify-center gap-1">
                                    {!isSkip && opt.forYou ? (
                                        <Star
                                            className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400 sm:h-3.5 sm:w-3.5"
                                            aria-hidden
                                        />
                                    ) : null}
                                    <span className="line-clamp-2 text-xs font-medium leading-snug sm:text-sm">
                                        {title}
                                    </span>
                                    {!isSkip && opt.forYou ? (
                                        <span className="hidden shrink-0 rounded-full border border-amber-400/50 bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-300 sm:inline">
                                            {FOR_YOU_BADGE_LABEL}
                                        </span>
                                    ) : null}
                                </div>
                                {resolvedOption.disabled ? (
                                    <span className="line-clamp-2 text-[10px] leading-snug text-zinc-500 sm:text-xs">
                                        {resolvedOption.disabledLabel ?? opt.disabledLabel ?? 'Unavailable'}
                                    </span>
                                ) : opt.loreDescription ? (
                                    <span className="line-clamp-2 text-[10px] leading-snug text-zinc-400 sm:text-xs">
                                        {opt.loreDescription}
                                    </span>
                                ) : null}
                                {!isSkip && resolvedOption.researchReward ? (
                                    <div className="flex max-w-full justify-center pt-0.5">
                                        <ResearchRewardTinyChip node={resolvedOption.researchReward.node} />
                                    </div>
                                ) : null}
                                {!isSkip && isGrantResources(opt.action) ? (
                                    <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
                                        {campaignResourceGains({
                                            food: opt.action.food,
                                            metal: opt.action.metal,
                                            crystals: opt.action.crystals,
                                        }).map(({ resource, count }) => (
                                            <ResourcePill
                                                key={`${opt.id}-${resource}`}
                                                resource={resource}
                                                count={count}
                                            />
                                        ))}
                                    </div>
                                ) : null}
                            </button>
                        );
                    })}
                />
            </div>
        </div>
    );
}
