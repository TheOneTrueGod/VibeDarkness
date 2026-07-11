/**
 * RowSlotDialogue - the Bottom Row slot's content: the current dialogue line's speaker name and
 * text. Clicking anywhere in the row advances the dialogue, same as the floating Next button.
 */
import React from 'react';
import type { DialoguePhrase } from '../../../storylines/storyTypes';
import { getNpc } from '../../../constants/npcs';
import StoryTextEffect from '../StoryTextEffect';

interface RowSlotDialogueProps {
    phrase: DialoguePhrase;
    onAdvance: () => void;
    /** When the speaker has no NPC entry (e.g. post-mission narrator). */
    speakerNameFallback?: string;
}

export default function RowSlotDialogue({ phrase, onAdvance, speakerNameFallback = 'Unknown' }: RowSlotDialogueProps) {
    const npc = getNpc(phrase.speakerId);
    const isTitleEffect = phrase.textEffect === 'title_bounce';

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onAdvance}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onAdvance();
                }
            }}
            className="flex h-full min-h-0 w-full cursor-pointer flex-col gap-1 overflow-y-auto"
        >
            <div className="shrink-0 text-lg font-bold sm:text-xl" style={{ color: npc?.color ?? '#ffffff' }}>
                {npc?.name ?? speakerNameFallback}
            </div>
            <div className="text-base leading-relaxed text-white whitespace-pre-line sm:text-lg">
                {isTitleEffect ? <StoryTextEffect effect="title_bounce" text={phrase.text} /> : <p className="mb-0">{phrase.text}</p>}
            </div>
        </div>
    );
}
