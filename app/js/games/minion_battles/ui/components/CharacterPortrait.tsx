/**
 * Reusable character portrait tile.
 * Accepts either a Vite asset URL (SVG/PNG) or a raw SVG string (for NPC portraits).
 * URLs are rendered via <img>; SVG strings are inlined with dangerouslySetInnerHTML.
 *
 * Optional name / characterId render in a footer row inside the square frame
 * (name left, id right), so the image area is slightly shorter when present.
 * When space is tight, the id truncates first (`...`); the name keeps priority.
 */
import React from 'react';

export type CharacterPortraitSize = 'small' | 'medium' | 'large';

const SIZE_PX: Record<CharacterPortraitSize, number> = {
    small: 96,
    medium: 180,
    large: 240,
};

export interface CharacterPortraitProps {
    /** Vite asset URL (e.g. from portrait.picture) or raw SVG string (e.g. for NPC portraits). */
    picture: string;
    /** Preset size: small 96px, medium 180px, large 240px (outer square). Ignored when `fill`. */
    size?: CharacterPortraitSize;
    /** Optional custom outer square size in px, overrides preset `size` when provided. */
    sizePx?: number;
    /**
     * When true, the outer frame is `aspect-square w-full` and fills the parent width.
     * Use inside a sized container (e.g. bottom-left slot).
     */
    fill?: boolean;
    /** Optional display name — left side of the footer row. */
    name?: string;
    /** Optional character id — right side of the footer row (muted); truncates before name. */
    characterId?: string;
    /** When true, applies the primary (teal) selected outline. */
    selected?: boolean;
    /** When false, omits the border (e.g. parent already frames the tile). Defaults to true. */
    showBorder?: boolean;
    /** Optional trailing content in the footer row (e.g. player color dots). */
    footerTrailing?: React.ReactNode;
    /** Optional extra class names for the outer wrapper. */
    className?: string;
}

function isUrl(picture: string): boolean {
    const trimmed = picture.trimStart();
    return trimmed.length > 0 && !trimmed.startsWith('<');
}

export default function CharacterPortrait({
    picture,
    size = 'medium',
    sizePx,
    fill = false,
    name,
    characterId,
    selected = false,
    showBorder = true,
    footerTrailing,
    className = '',
}: CharacterPortraitProps) {
    const px = sizePx ?? SIZE_PX[size];
    const showFooter = name != null || characterId != null || footerTrailing != null;

    const borderClass = !showBorder
        ? ''
        : selected
          ? 'border-2 border-primary shadow-[0_0_0_1px_rgba(78,205,196,0.25)]'
          : 'border-2 border-border-custom';

    const imageInner = picture ? (
        isUrl(picture) ? (
            <img src={picture} alt={name ?? ''} className="h-full w-full object-cover" />
        ) : (
            <div
                className="relative flex h-full w-full items-center justify-center [&_svg]:absolute [&_svg]:left-1/2 [&_svg]:top-1/2 [&_svg]:block [&_svg]:h-auto [&_svg]:max-h-full [&_svg]:w-auto [&_svg]:max-w-full [&_svg]:-translate-x-1/2 [&_svg]:-translate-y-1/2"
                dangerouslySetInnerHTML={{ __html: picture }}
            />
        )
    ) : (
        <span className="text-sm text-gray-500">No portrait</span>
    );

    return (
        <div
            className={`flex shrink-0 flex-col overflow-hidden rounded-lg bg-background ${borderClass} ${
                fill ? 'aspect-square w-full min-h-0' : ''
            } ${className}`}
            style={fill ? undefined : { width: px, height: px }}
        >
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background">
                {imageInner}
            </div>
            {showFooter && (
                <div className="flex min-w-0 shrink-0 items-center gap-1 bg-surface-light px-2 py-1.5">
                    {name != null && name !== '' && (
                        <span className="min-w-0 shrink truncate text-sm font-semibold text-white">
                            {name}
                        </span>
                    )}
                    {characterId != null && characterId !== '' && (
                        <span
                            className="min-w-0 grow basis-0 self-end truncate text-right text-[9px] text-muted"
                            style={{ flexShrink: 999 }}
                            title={characterId}
                        >
                            {characterId}
                        </span>
                    )}
                    {footerTrailing != null && (
                        <div
                            className={`flex shrink-0 items-center gap-1 ${
                                characterId != null && characterId !== '' ? '' : 'ml-auto'
                            }`}
                        >
                            {footerTrailing}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
