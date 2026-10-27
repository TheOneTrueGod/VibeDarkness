import React, { useMemo } from 'react';
import { Star } from 'lucide-react';
import type { ChoicePhrase, StoryChoiceAction, StoryChoiceOptionRow } from '../../../storylines/storyTypes';
import ResearchRewardTinyChip from '../../../../../components/ResearchRewardTinyChip';
import StoryChoiceGrid, {
    STORY_CHOICE_CELL_BUTTON_BASE,
    STORY_CHOICE_CELL_BUTTON_DISABLED,
    STORY_CHOICE_CELL_BUTTON_PRIMARY,
    STORY_CHOICE_CELL_BUTTON_SKIP,
} from '../../components/battleUiSlots/StoryChoiceGrid';
import { storyChoiceTestId } from '../../../../../testing/testIds';
import DisabledStoryChoiceTooltip, {
    UNAVAILABLE_CHOICE_REASON,
} from './DisabledStoryChoiceTooltip';
import type { ResearchNodeDef } from '../../../../../researchTrees/types';
import { getResearchTree } from '../../../../../researchTrees/list';
import { TestIds } from '../../../../../testing/testIds';
import { arrangeStoryChoiceGridSlots, isStoryChoiceSkipOption } from './storyChoiceGrid';
import { createStoryChoiceSkipOption } from '../../../storylines/storyChoiceOptions';
import { ITEM_ICON_URLS } from '../../../character_defs/items';
import StoryChoiceDescriptionRow from './StoryChoiceDescriptionRow';

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

/** Post-mission choices always offer a skip row (shared with the Skip Chapter wizard). */
function syntheticPostMissionSkipOption(): StoryChoiceOptionRow {
    return createStoryChoiceSkipOption();
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
                        const researchTree =
                            !isSkip && resolvedOption.researchReward
                                ? getResearchTree(resolvedOption.researchReward.treeId)
                                : undefined;
                        const title = opt.loreTitle ?? opt.label;
                        const disabledReason = resolvedOption.disabled
                            ? (resolvedOption.disabledLabel ?? opt.disabledLabel ?? UNAVAILABLE_CHOICE_REASON)
                            : undefined;
                        const buttonClass = `${STORY_CHOICE_CELL_BUTTON_BASE} ${
                            resolvedOption.disabled
                                ? `${STORY_CHOICE_CELL_BUTTON_DISABLED} pointer-events-none`
                                : isSkip
                                  ? STORY_CHOICE_CELL_BUTTON_SKIP
                                  : STORY_CHOICE_CELL_BUTTON_PRIMARY
                        }`;

                        const button = (
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
                                title={opt.loreDescription}
                            >
                                <div className="flex w-full min-w-0 shrink-0 items-center justify-center gap-1">
                                    {!isSkip && researchTree ? (
                                        <img
                                            src={researchTree.icon}
                                            alt=""
                                            data-testid={TestIds.storyChoiceResearchTreeIcon}
                                            title={researchTree.title}
                                            className="h-5 w-5 shrink-0 rounded-sm object-cover"
                                        />
                                    ) : null}
                                    {!isSkip && opt.action?.type === 'equip_item' && ITEM_ICON_URLS[opt.action.itemId] ? (
                                        <img
                                            src={ITEM_ICON_URLS[opt.action.itemId]}
                                            alt=""
                                            data-testid="story-choice-item-icon"
                                            className="h-5 w-5 shrink-0 object-contain"
                                        />
                                    ) : null}
                                    {!isSkip && opt.forYou ? (
                                        <Star
                                            className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400 sm:h-3.5 sm:w-3.5"
                                            aria-hidden
                                        />
                                    ) : null}
                                    <span className="line-clamp-2 text-xs font-medium leading-tight sm:text-sm">
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
                                        {disabledReason}
                                    </span>
                                ) : (
                                    <StoryChoiceDescriptionRow
                                        optionId={opt.id}
                                        description={opt.loreDescription}
                                        action={isSkip ? undefined : opt.action}
                                        singleLine={!isSkip && !!resolvedOption.researchReward}
                                    />
                                )}
                                {!isSkip && resolvedOption.researchReward ? (
                                    <div className="flex max-w-full shrink-0 justify-center pt-0.5">
                                        <ResearchRewardTinyChip
                                            node={resolvedOption.researchReward.node}
                                            tree={researchTree}
                                        />
                                    </div>
                                ) : null}
                            </button>
                        );

                        if (!resolvedOption.disabled) return button;

                        return (
                            <DisabledStoryChoiceTooltip key={opt.id} reason={disabledReason}>
                                {button}
                            </DisabledStoryChoiceTooltip>
                        );
                    })}
                />
            </div>
        </div>
    );
}
