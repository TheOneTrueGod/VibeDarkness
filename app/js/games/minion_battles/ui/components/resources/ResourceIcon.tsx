/**
 * ResourceIcon — maps a resource's iconName string to a Lucide component.
 *
 * This is the single swap-point for migrating from Lucide icons to custom
 * SVGs or PNGs in the future. Change the lookup here; all resource bars
 * update automatically.
 */

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

interface ResourceIconProps {
    name: string;
    size?: number;
    className?: string;
}

export function ResourceIcon({ name, size = 16, className }: ResourceIconProps) {
    const Icon = ICON_MAP[name];
    if (!Icon) return null;
    return <Icon size={size} className={className} />;
}
