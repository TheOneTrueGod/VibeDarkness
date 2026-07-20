import React from 'react';
import { STORY_BACKGROUNDS } from '../../../assets/story';

/**
 * Center empty state when the player has no loadout to pick:
 * image fills the slot as wide as possible (and as tall as aspect ratio allows),
 * with transparent letterboxing where it does not cover.
 */
export function CharacterSelectLoadoutEmptyState() {
    return (
        <div className="flex h-full min-h-0 w-full items-center justify-center">
            <img
                src={STORY_BACKGROUNDS.campfire}
                alt=""
                className="h-full w-full object-contain"
                draggable={false}
            />
        </div>
    );
}
