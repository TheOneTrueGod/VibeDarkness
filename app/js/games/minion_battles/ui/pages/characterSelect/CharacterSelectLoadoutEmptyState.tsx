import React from 'react';
import { STORY_BACKGROUNDS } from '../../../assets/story';

/**
 * Center empty state when the player has no loadout to pick:
 * largest centered square that fits the slot, transparent letterboxing around it.
 */
export function CharacterSelectLoadoutEmptyState() {
    return (
        <div
            className="h-full w-full min-h-0"
            style={{ containerType: 'size' }}
        >
            <div className="flex h-full w-full items-center justify-center">
                <div
                    className="overflow-hidden rounded-lg"
                    style={{
                        width: 'min(100cqw, 100cqh)',
                        height: 'min(100cqw, 100cqh)',
                    }}
                >
                    <img
                        src={STORY_BACKGROUNDS.campfire}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                    />
                </div>
            </div>
        </div>
    );
}
