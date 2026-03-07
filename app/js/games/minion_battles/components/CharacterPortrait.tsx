/**
 * Reusable portrait container for character/NPC SVG images.
 * Keeps 1:1 aspect ratio, scales and centers the SVG inside the wrapper.
 */
import React from 'react';

export type CharacterPortraitSize = 'small' | 'medium' | 'large';

const SIZE_PX: Record<CharacterPortraitSize, number> = {
    small: 96,
    medium: 180,
    large: 240,
};

interface CharacterPortraitProps {
    /** SVG string (e.g. from getPortrait(id).picture or npc.portrait). */
    picture: string;
    /** Preset size: small 96px, medium 180px, large 240px (width and height). */
    size?: CharacterPortraitSize;
    /** Optional extra class names for the wrapper (e.g. border, shadow). */
    className?: string;
}

export default function CharacterPortrait({
    picture,
    size = 'medium',
    className = '',
}: CharacterPortraitProps) {
    const px = SIZE_PX[size];
    return (
        <div
            className={`rounded-lg overflow-hidden relative bg-background shrink-0 ${className}`}
            style={{ width: px, height: px }}
        >
            <div className="absolute inset-0 flex items-center justify-center">
                <div
                    className="flex items-center justify-center relative w-full h-full [&_svg]:absolute [&_svg]:left-1/2 [&_svg]:top-1/2 [&_svg]:-translate-x-1/2 [&_svg]:-translate-y-1/2 [&_svg]:max-w-full [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:h-auto [&_svg]:block"
                    dangerouslySetInnerHTML={{ __html: picture }}
                />
            </div>
        </div>
    );
}
