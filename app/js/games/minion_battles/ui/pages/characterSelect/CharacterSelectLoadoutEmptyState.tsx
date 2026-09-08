import React from 'react';
import { STORY_BACKGROUNDS } from '../../../assets/story';

/**
 * Center empty state when the player has no loadout to pick (classic/mobile shell).
 * Unified slot layout uses a full-bleed cover background on CharacterSelectLayout instead.
 */
export function CharacterSelectLoadoutEmptyState() {
    return (
        <div className="flex h-full min-h-0 w-full items-center justify-center bg-black">
            <img
                src={STORY_BACKGROUNDS.campfire}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
            />
        </div>
    );
}
