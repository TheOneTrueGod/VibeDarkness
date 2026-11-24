/**
 * Special tile definitions for missions.
 *
 * Special tiles have a grid coordinate and are rendered on a layer above terrain.
 * Each def describes the tile type (image, HP, etc.).
 */

import type { SpecialTilePlacement } from './types';

/**
 * Proximity activation: the tile starts dormant and wakes once player-controlled units have stood
 * within `radiusTiles` (Chebyshev, grid cells) of it for `durationSeconds` of world time. While
 * dormant it emits no light (the placement's `emitsLight` waits) and shows a progress ring.
 * Progress drains at `drainPerSecond` (fraction of the full bar per world second) when nobody is in
 * range. Activation is one-way and emits `special_tile_activated`.
 */
export interface ProximityActivationSpec {
    radiusTiles: number;
    durationSeconds: number;
    /** Fraction of the bar lost per world second with nobody in range. Default: the fill rate. */
    drainPerSecond?: number;
}

/** Fields every special tile def may carry. */
interface SpecialTileDefBase {
    /** SVG image URL (data URL or file URL). */
    image: string;
    /**
     * Draw above the darkness and fog overlays, so the tile is seen even where it is unlit
     * (a landmark the players can find in the dark). Render-only; no effect on light or AI.
     */
    visibleInDarkness?: boolean;
    /** Starts dormant and activates when players stand near it (see `ProximityActivationSpec`). */
    proximityActivation?: ProximityActivationSpec;
}

/** Campfire: a tile with hit points and optional light. Light and maxHp are set per placement. */
export interface CampfireDef extends SpecialTileDefBase {
    id: 'Campfire';
}

/** Crystal: indestructible tile; light and maxHp are set per placement in the mission. */
export interface CrystalDef extends SpecialTileDefBase {
    id: 'Crystal';
}

/** Dark Crystal: emits DarkLight; colorFilter creates arena effect. */
export interface DarkCrystalDef extends SpecialTileDefBase {
    id: 'DarkCrystal';
}

/**
 * Wall Crystal: a dim crystal set into a wall that lights up once a hero lingers near it
 * (proximity activation). Its light is FireLight, so it lights the way without hurting dark creatures.
 */
export interface WallCrystalDef extends SpecialTileDefBase {
    id: 'WallCrystal';
}

export type SpecialTileDef = CampfireDef | CrystalDef | DarkCrystalDef | WallCrystalDef;

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

/** Wall crystal SVG (pale amber, matching its FireLight). */
const WALL_CRYSTAL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <polygon points="16,3 24,14 16,29 8,14" fill="#f5d08a" stroke="#c99a3c" stroke-width="1"/>
  <polygon points="16,7 20,14 16,23 12,14" fill="#fff1c9" opacity="0.7"/>
</svg>`;
const WALL_CRYSTAL_DATA_URL = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(WALL_CRYSTAL_SVG)))}`;

/** Proximity activation for wall crystals: 2 s within 2 tiles. */
export const WALL_CRYSTAL_ACTIVATION: ProximityActivationSpec = {
    radiusTiles: 2,
    durationSeconds: 2,
};

/** Light a wall crystal gives once awake (full strength within `radius`, then falls off 1 per tile). */
export const WALL_CRYSTAL_LIGHT_AMOUNT = 6;
export const WALL_CRYSTAL_LIGHT_RADIUS = 3;

/** Placement fields for a wall crystal (add `col` / `row`). */
export const WALL_CRYSTAL_TILE_DEFAULTS: Omit<SpecialTilePlacement, 'col' | 'row'> = {
    defId: 'WallCrystal',
    emitsLight: {
        lightAmount: WALL_CRYSTAL_LIGHT_AMOUNT,
        radius: WALL_CRYSTAL_LIGHT_RADIUS,
        lightType: 'FireLight',
    },
};

/** Registry of special tile definitions by ID. Light and maxHp come from mission placement. */
export const SPECIAL_TILE_DEFS: Record<string, SpecialTileDef> = {
    Campfire: { id: 'Campfire', image: CAMPFIRE_DATA_URL },
    Crystal: { id: 'Crystal', image: CRYSTAL_DATA_URL },
    DarkCrystal: { id: 'DarkCrystal', image: DARK_CRYSTAL_DATA_URL },
    WallCrystal: {
        id: 'WallCrystal',
        image: WALL_CRYSTAL_DATA_URL,
        proximityActivation: WALL_CRYSTAL_ACTIVATION,
        visibleInDarkness: true,
    },
};

export function getSpecialTileDef(id: string): SpecialTileDef | undefined {
    return SPECIAL_TILE_DEFS[id];
}
