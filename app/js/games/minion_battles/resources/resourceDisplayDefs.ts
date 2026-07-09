import type { ResourceDisplay } from './Resource';

/** All known resource types with their display metadata, ordered for the debug panel. */
export const ALL_RESOURCE_DISPLAY_DEFS: Array<Omit<ResourceDisplay, 'current'>> = [
    { id: 'light',       name: 'Light',       color: '#fef9c3', iconName: 'Sun',        max: 5 },
    { id: 'rock',        name: 'Rock',        color: '#92400e', iconName: 'Mountain',   max: 24 },
    { id: 'ammo',        name: 'Ammo',        color: '#eab308', iconName: 'Crosshair',  max: 100 },
    { id: 'gravity',     name: 'Gravity',     color: '#a855f7', iconName: 'Atom',       max: 100 },
    { id: 'mana',        name: 'Mana',        color: '#3b82f6', iconName: 'Wand2',      max: 100 },
    { id: 'rage',        name: 'Rage',        color: '#ef4444', iconName: 'Flame',      max: 100 },
    { id: 'resonance',   name: 'Resonance',   color: '#84cc16', iconName: 'Layers',     max: 100 },
    { id: 'movement_points', name: 'Movement Points', color: '#22c55e', iconName: 'Footprints', max: 2 },
];
