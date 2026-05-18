/**
 * Reusable portrait container.
 * Accepts either a Vite asset URL (SVG/PNG) or a raw SVG string (for NPC portraits).
 * URLs are rendered via <img>; SVG strings are inlined with dangerouslySetInnerHTML.
 */
import React from 'react';

export type CharacterPortraitSize = 'small' | 'medium' | 'large';

const SIZE_PX: Record<CharacterPortraitSize, number> = {
    small: 96,
    medium: 180,
    large: 240,
};

interface CharacterPortraitProps {
    /** Vite asset URL (e.g. from portrait.picture) or raw SVG string (e.g. for NPC portraits). */
    picture: string;
    /** Preset size: small 96px, medium 180px, large 240px (width and height). */
    size?: CharacterPortraitSize;
    /** Optional extra class names for the wrapper (e.g. border, shadow). */
    className?: string;
    /** Optional custom square size in px, overrides preset `size` when provided. */
    sizePx?: number;
}

function isUrl(picture: string): boolean {
    const trimmed = picture.trimStart();
    return trimmed.length > 0 && !trimmed.startsWith('<');
}

export default function CharacterPortrait({
    picture,
    size = 'medium',
    className = '',
    sizePx,
}: CharacterPortraitProps) {
    const px = sizePx ?? SIZE_PX[size];
    return (
        <div
            className={`rounded-lg overflow-hidden relative bg-background shrink-0 ${className}`}
            style={{ width: px, height: px }}
        >
            <div className="absolute inset-0 flex items-center justify-center">
                {isUrl(picture) ? (
                    <img
                        src={picture}
                        alt=""
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div
                        className="flex items-center justify-center relative w-full h-full [&_svg]:absolute [&_svg]:left-1/2 [&_svg]:top-1/2 [&_svg]:-translate-x-1/2 [&_svg]:-translate-y-1/2 [&_svg]:max-w-full [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:h-auto [&_svg]:block"
                        dangerouslySetInnerHTML={{ __html: picture }}
                    />
                )}
            </div>
        </div>
    );
}
