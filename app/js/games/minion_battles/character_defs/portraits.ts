/**
 * Portrait definitions for campaign character creation.
 * Map of portrait ID -> { id, name, picture }.
 * Filled with the same portraits as the legacy character defs (warrior, mage, ranger, healer, rogue, necromancer).
 */

import { CHARACTERS } from './characters';

export interface PortraitDef {
    id: string;
    name: string;
    /** SVG string or image URL for the portrait */
    picture: string;
}

export const PORTRAITS: Record<string, PortraitDef> = {};

for (const c of CHARACTERS) {
    PORTRAITS[c.id] = {
        id: c.id,
        name: c.name,
        picture: c.picture,
    };
}

const PORTRAIT_IDS = Object.keys(PORTRAITS);

export function getPortraitIds(): string[] {
    return [...PORTRAIT_IDS];
}

export function getPortrait(id: string): PortraitDef | undefined {
    return PORTRAITS[id];
}

export function getPortraitCount(): number {
    return PORTRAIT_IDS.length;
}
