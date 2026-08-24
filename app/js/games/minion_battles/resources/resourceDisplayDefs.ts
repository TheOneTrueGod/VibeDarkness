import type { ResourceDisplay } from './Resource';
import { LIGHT_RESOURCE_COLOR, LIGHT_STARTING_MAX } from './Light';
import { MOVEMENT_BASE_MAX } from './Movement';

/** All known resource types with their display metadata, ordered for the debug panel. */
export const ALL_RESOURCE_DISPLAY_DEFS: Array<Omit<ResourceDisplay, 'current'>> = [
    // #f87171 matches Tailwind's red-400 — the colour UnitResourcePanel's bottom-left heart icon uses.
    { id: 'hp',          name: 'Health',      color: '#f87171', iconName: 'Heart',      max: 100 },
    { id: 'shield',      name: 'Shield',      color: '#0ea5e9', iconName: 'Shield',     max: 100 },
    { id: 'light',       name: 'Light',       color: LIGHT_RESOURCE_COLOR, iconName: 'Sun',        max: LIGHT_STARTING_MAX },
    { id: 'rock',        name: 'Rock',        color: '#92400e', iconName: 'Mountain',   max: 24 },
    { id: 'ammo',        name: 'Ammo',        color: '#eab308', iconName: 'Crosshair',  max: 100 },
    { id: 'gravity',     name: 'Gravity',     color: '#a855f7', iconName: 'Atom',       max: 100 },
    { id: 'mana',        name: 'Mana',        color: '#3b82f6', iconName: 'Wand2',      max: 100 },
    { id: 'rage',        name: 'Rage',        color: '#ef4444', iconName: 'Flame',      max: 100 },
    { id: 'resonance',   name: 'Resonance',   color: '#84cc16', iconName: 'Layers',     max: 100 },
    { id: 'movement_points', name: 'Movement Points', color: '#22c55e', iconName: 'Footprints', max: MOVEMENT_BASE_MAX },
];

/** Convenience export for the handful of places that render a plain shield icon/overlay (not via ResourceIcon). */
export const SHIELD_RESOURCE_COLOR = ALL_RESOURCE_DISPLAY_DEFS.find((d) => d.id === 'shield')!.color;
