import React from 'react';
import ResourcePill, { visibleCampaignResourceGains } from '../../../../../components/ResourcePill';
import { useCurrentUser } from '../../../../../user/useCurrentUser';
import type { StoryChoiceAction } from '../../../storylines/storyTypes';
import { storyChoiceActionResourceDelta } from '../../../storylines/storyChoiceOptions';

interface StoryChoiceDescriptionRowProps {
    optionId: string;
    description?: string;
    /** Resource pills come from this action (see `storyChoiceActionResourceDelta`); omit for none. */
    action?: StoryChoiceAction;
}

/** A story choice's description with its resource pills: description on the left, pills on the right. */
export default function StoryChoiceDescriptionRow({
    optionId,
    description,
    action,
}: StoryChoiceDescriptionRowProps) {
    const { knowledge } = useCurrentUser();
    const gains = visibleCampaignResourceGains(storyChoiceActionResourceDelta(action), knowledge);
    if (gains.length === 0) {
        return description ? (
            <span
                data-className="StoryChoiceDescriptionRow"
                className="line-clamp-2 w-full min-h-0 shrink-0 text-[10px] leading-snug text-zinc-400 sm:text-xs"
            >
                {description}
            </span>
        ) : null;
    }
    return (
        <div
            data-className="StoryChoiceDescriptionRow"
            className={`flex w-full min-w-0 items-center gap-2 ${description ? 'justify-between' : 'justify-center'}`}
        >
            {description ? (
                <span className="line-clamp-2 min-w-0 text-left text-[10px] leading-snug text-zinc-400 sm:text-xs">
                    {description}
                </span>
            ) : null}
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                {gains.map(({ resource, count }) => (
                    <ResourcePill key={`${optionId}-${resource}`} resource={resource} count={count} />
                ))}
            </div>
        </div>
    );
}
