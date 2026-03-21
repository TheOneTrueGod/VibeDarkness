/**
 * Special tile definitions for missions.
 *
 * Special tiles have a grid coordinate and are rendered on a layer above terrain.
 * Each def describes the tile type (image, HP, etc.).
 */

/** Campfire: a tile with hit points and optional light. Light and maxHp are set per placement. */
export interface CampfireDef {
    id: 'Campfire';
    /** SVG image URL (data URL or file URL). */
    image: string;
}

/** Crystal: indestructible tile; light, protectRadius, and maxHp are set per placement in the mission. */
export interface CrystalDef {
    id: 'Crystal';
    /** SVG image URL (data URL or file URL). */
    image: string;
}

/** Dark Crystal: emits purple-tinted light; colorFilter creates arena effect. */
export interface DarkCrystalDef {
    id: 'DarkCrystal';
    /** SVG image URL (data URL or file URL). */
    image: string;
}

export type SpecialTileDef = CampfireDef | CrystalDef | DarkCrystalDef;

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

/** Small blue crystal SVG for safe-zone tiles. */
const CRYSTAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs>
    <linearGradient id="crystalGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#88ccff"/>
      <stop offset="50%" stop-color="#4488dd"/>
      <stop offset="100%" stop-color="#2266aa"/>
    </linearGradient>
  </defs>
  <polygon points="16,2 28,14 16,30 4,14" fill="url(#crystalGrad)" stroke="#66aaff" stroke-width="1"/>
  <polygon points="16,6 22,14 16,24 10,14" fill="#aaddff" opacity="0.6"/>
</svg>`;
const CRYSTAL_DATA_URL = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(CRYSTAL_SVG)))}`;

/** Dark crystal SVG (purple tint). */
const DARK_CRYSTAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <defs>
    <linearGradient id="darkCrystalGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#aa88ff"/>
      <stop offset="50%" stop-color="#6633aa"/>
      <stop offset="100%" stop-color="#441188"/>
    </linearGradient>
  </defs>
  <polygon points="16,2 28,14 16,30 4,14" fill="url(#darkCrystalGrad)" stroke="#8866cc" stroke-width="1"/>
  <polygon points="16,6 22,14 16,24 10,14" fill="#cc99ff" opacity="0.5"/>
</svg>`;
const DARK_CRYSTAL_DATA_URL = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(DARK_CRYSTAL_SVG)))}`;

/** Registry of special tile definitions by ID. Light, maxHp, protectRadius come from mission placement. */
export const SPECIAL_TILE_DEFS: Record<string, SpecialTileDef> = {
    Campfire: { id: 'Campfire', image: CAMPFIRE_DATA_URL },
    Crystal: { id: 'Crystal', image: CRYSTAL_DATA_URL },
    DarkCrystal: { id: 'DarkCrystal', image: DARK_CRYSTAL_DATA_URL },
};

export function getSpecialTileDef(id: string): SpecialTileDef | undefined {
    return SPECIAL_TILE_DEFS[id];
}
