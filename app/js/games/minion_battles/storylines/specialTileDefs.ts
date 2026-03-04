/**
 * Special tile definitions for missions.
 *
 * Special tiles have a grid coordinate and are rendered on a layer above terrain.
 * Each def describes the tile type (image, HP, etc.).
 */

/** DefendPoint: a point to defend with hit points. */
export interface DefendPointDef {
    id: 'DefendPoint';
    /** SVG image URL (data URL or file URL). */
    image: string;
    /** Maximum hit points. */
    maxHp: number;
    /** Light added at this tile; omitted = no light. */
    lightEmission?: number;
    /** Max tile distance this light affects (Chebyshev). */
    lightRadius?: number;
}

export type SpecialTileDef = DefendPointDef;

/** Inline campfire SVG: two logs and a small flame. */
const CAMPFIRE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <!-- Two logs -->
  <ellipse cx="8" cy="22" rx="10" ry="4" fill="#5c4033" stroke="#3d2b1f" stroke-width="1"/>
  <ellipse cx="24" cy="24" rx="10" ry="4" fill="#5c4033" stroke="#3d2b1f" stroke-width="1"/>
  <!-- Small flame -->
  <path d="M16 4 C20 12 22 18 16 24 C10 18 12 12 16 4 Z" fill="#ff6b35" opacity="0.9"/>
  <path d="M16 8 C18 14 19 18 16 22 C13 18 14 14 16 8 Z" fill="#ffa500"/>
  <path d="M16 11 C17 15 17 18 16 20 C15 18 15 15 16 11 Z" fill="#ffd700"/>
</svg>`;

/** Data URL for the campfire SVG (PixiJS can load this). */
const CAMPFIRE_DATA_URL = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(CAMPFIRE_SVG)))}`;

/** Registry of special tile definitions by ID. */
export const SPECIAL_TILE_DEFS: Record<string, SpecialTileDef> = {
    DefendPoint: {
        id: 'DefendPoint',
        image: CAMPFIRE_DATA_URL,
        maxHp: 5,
        lightEmission: 30,
        lightRadius: 20,
    },
};

export function getSpecialTileDef(id: string): SpecialTileDef | undefined {
    return SPECIAL_TILE_DEFS[id];
}
