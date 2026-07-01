/**
 * ResourceIcon — circular disc badge for a resource type.
 *
 * Renders a circle with:
 *  - border in the resource's colour
 *  - configurable background (defaults to dark neutral)
 *  - icon centred in the resource's colour
 *
 * Icon sources, in priority order:
 *  1. Lucide icon matched by iconName in ICON_MAP
 *  2. <img> fallback — treats iconName as an image URL (SVG / PNG)
 *
 * This is the single swap-point for migrating icon art. Update ICON_MAP
 * or add a URL entry in ALL_RESOURCE_DISPLAY_DEFS to change any icon globally.
 */

import React from 'react';
import {
    Crosshair,
    Sun,
    Mountain,
    Atom,
    Flame,
    Wand2,
    Layers,
    Heart,
    Footprints,
    type LucideIcon,
} from 'lucide-react';
import { ALL_RESOURCE_DISPLAY_DEFS } from '../../../resources/resourceDisplayDefs';

const ICON_MAP: Record<string, LucideIcon> = {
    Crosshair,
    Sun,
    Mountain,
    Atom,
    Flame,
    Wand2,
    Layers,
    Heart,
    Footprints,
};

const RESOURCE_DEF_BY_ID = Object.fromEntries(
    ALL_RESOURCE_DISPLAY_DEFS.map((d) => [d.id, d]),
);

interface ResourceIconProps {
    resourceId: string;
    /** Diameter in px; defaults to 22 */
    size?: number;
    /** Tailwind class for the background; defaults to 'bg-neutral-900' */
    bgClass?: string;
    className?: string;
    style?: React.CSSProperties;
}

export function ResourceIcon({
    resourceId,
    size = 22,
    bgClass = 'bg-neutral-900',
    className,
    style,
}: ResourceIconProps) {
    const def = RESOURCE_DEF_BY_ID[resourceId];
    if (!def) return null;

    const LucideIconComp = ICON_MAP[def.iconName];
    const iconPx = Math.round(size * 0.55);

    return (
        <span
            style={{ width: size, height: size, borderColor: def.color, ...style }}
            className={`flex shrink-0 items-center justify-center rounded-full border ${bgClass}${className ? ` ${className}` : ''}`}
        >
            {LucideIconComp ? (
                <LucideIconComp
                    size={iconPx}
                    style={{ color: def.color }}
                    strokeWidth={2}
                    aria-hidden
                />
            ) : (
                <img src={def.iconName} style={{ width: iconPx, height: iconPx }} alt="" />
            )}
        </span>
    );
}
