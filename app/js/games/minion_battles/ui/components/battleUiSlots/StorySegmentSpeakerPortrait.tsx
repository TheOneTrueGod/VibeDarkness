/**
 * StorySegmentSpeakerPortrait - a Corner slot's content: the current dialogue speaker's portrait
 * and name. Which corner it's placed in is driven by the phrase's `portraitSide` (see storyTypes.ts).
 */
import React from 'react';
import { getNpc } from '../../../constants/npcs';
import CharacterPortrait from '../CharacterPortrait';

const PORTRAIT_SIZE_PX = 230;

interface StorySegmentSpeakerPortraitProps {
    speakerId?: string;
}

export default function StorySegmentSpeakerPortrait({ speakerId }: StorySegmentSpeakerPortraitProps) {
    const npc = speakerId ? getNpc(speakerId) : undefined;
    if (!npc) return null;

    return (
        <div className="flex h-full w-full items-center justify-center">
            {npc.portrait ? (
                <CharacterPortrait
                    picture={npc.portrait}
                    sizePx={PORTRAIT_SIZE_PX}
                    className="border-2 border-primary shadow-lg"
                />
            ) : (
                <div
                    className="rounded-lg border-2 border-primary shadow-lg"
                    style={{ width: PORTRAIT_SIZE_PX, height: PORTRAIT_SIZE_PX, backgroundColor: npc.color }}
                />
            )}
        </div>
    );
}
