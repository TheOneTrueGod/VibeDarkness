import React from 'react';
import type { ChoicePhrase } from '../../../storylines/storyTypes';
import ResourcePill, { campaignResourceGains } from '../../../../../components/ResourcePill';
import StoryPanelCard from './StoryPanelCard';
import { isGrantResources } from './preMissionStoryTypeGuards';
import { TestIds, storyChoiceTestId } from '../../../../../testing/testIds';

interface ChoicePhrasePanelProps {
    phrase: ChoicePhrase;
    amSpectator: boolean;
    onAdvance: () => void;
    onChoose: (
        choiceId: string,
        optionId: string,
        option?: { action?: { type: string; itemId?: string } },
    ) => void;
}

export default function ChoicePhrasePanel({ phrase, amSpectator, onAdvance, onChoose }: ChoicePhrasePanelProps) {
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
                    {phrase.options.map((opt) => (
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
                    ))}
                </div>
            )}
        </StoryPanelCard>
    );
}
