import React from 'react';
import type { DialoguePhrase } from '../../../storylines/storyTypes';
import { getNpc } from '../../../constants/npcs';
import VNTextBox, { type VNTextBoxDensity } from '../../components/VNTextBox';
import StoryTextEffect from '../../components/StoryTextEffect';

interface DialoguePhrasePanelProps {
    phrase: DialoguePhrase;
    onAdvance: () => void;
    density?: VNTextBoxDensity;
    /** When the speaker has no NPC entry (e.g. post-mission narrator). */
    speakerNameFallback?: string;
}

export default function DialoguePhrasePanel({
    phrase,
    onAdvance,
    density = 'desktop',
    speakerNameFallback = 'Unknown',
}: DialoguePhrasePanelProps) {
    const isTitleEffect = phrase.textEffect === 'title_bounce';

    return (
        <VNTextBox
            density={density}
            title={getNpc(phrase.speakerId)?.name ?? speakerNameFallback}
            titleColor={getNpc(phrase.speakerId)?.color ?? '#ffffff'}
            actions={
                <button
                    type="button"
                    onClick={onAdvance}
                    className="px-6 py-2 bg-primary text-white font-semibold rounded-lg hover:opacity-90"
                >
                    Next
                </button>
            }
        >
            {isTitleEffect ? (
                <StoryTextEffect effect="title_bounce" text={phrase.text} />
            ) : (
                <p className="mb-0">{phrase.text}</p>
            )}
        </VNTextBox>
    );
}
