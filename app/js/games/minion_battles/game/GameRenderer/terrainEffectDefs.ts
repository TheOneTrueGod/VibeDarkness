import { WATER_THEME } from '../../themes/abilityThemes';

export interface TerrainEffectVisualDef {
    layer: 'ground' | 'air';
    svgString: string;
    /**
     * How much of the cell each sprite covers. `'lowerHalf'` (default) is a cell-wide strip in the
     * bottom half (thorns, gas); `'fullCell'` fills the whole cell, for surface sheets (ice, slime,
     * fire) whose cells should join into one field. Draw `'fullCell'` SVGs on a square viewBox.
     */
    footprint?: 'lowerHalf' | 'fullCell';
    /**
     * Ages the visual over a timed effect's lifetime (world clock, so it holds while paused):
     * scale and alpha lerp from 1 at placement to these values at expiry. Permanent effects ignore it.
     */
    lifetimeFade?: { endScale: number; endAlpha: number };
    /**
     * Animate-out after the record is removed (expiry, clearing, ...). Runs on wall time, so it
     * plays even while the battle is paused: scale and alpha lerp from wherever the visual was to
     * these values over `durationSec`, then the visual is destroyed. Omit to vanish instantly.
     */
    exit?: { durationSec: number; endScale: number; endAlpha: number };
    /**
     * Worn looks for a thorn effect that survives several triggers, least to most worn. The renderer
     * picks one with `getThornWearStage` (gameplay `terrainEffectDefs.ts`); stage 0 is `svgString`.
     */
    wornSvgStrings?: readonly string[];
}

interface ThornVineColours {
    /** The main vine. */
    vine: string;
    /** The thinner vine beneath it. */
    underVine: string;
    /** The thorn hooks. */
    thorn: string;
}

const DARK_THORN_COLOURS: ThornVineColours = { vine: '#7c3aed', underVine: '#5b21b6', thorn: '#a78bfa' };
const BRAMBLE_COLOURS: ThornVineColours = { vine: '#22c55e', underVine: '#16a34a', thorn: '#4ade80' };

/**
 * A frozen-field ice tile (full cell): a navy frost sheet, a soft seafoam rim inset from the cell edge
 * (adjacent tiles read as cracked ice panes rather than a hard grid) and a few faint six-armed flakes.
 * Colours are the Tidewater theme's, so the hazard matches the ability that places it.
 */
function frostSheetSvg(mass: string, edge: string, deep: string): string {
    const flake = (cx: number, cy: number, r: number, opacity: number): string => {
        const arms = [0, 60, 120]
            .map((deg) => {
                const a = (deg * Math.PI) / 180;
                const dx = Math.cos(a) * r;
                const dy = Math.sin(a) * r;
                return `M${(cx - dx).toFixed(2)},${(cy - dy).toFixed(2)} L${(cx + dx).toFixed(2)},${(cy + dy).toFixed(2)}`;
            })
            .join(' ');
        return `<path d="${arms}" stroke="${edge}" stroke-opacity="${opacity}" stroke-width="0.8" stroke-linecap="round" fill="none"/>`;
    };
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <defs>
    <linearGradient id="ff" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${mass}" stop-opacity="0.62"/>
      <stop offset="1" stop-color="${deep}" stop-opacity="0.7"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="40" height="40" fill="url(#ff)"/>
  <rect x="1.5" y="1.5" width="37" height="37" rx="3" fill="none" stroke="${edge}" stroke-opacity="0.45" stroke-width="1.2"/>
  <path d="M6,30 L15,22 L19,25 M24,9 L31,15" stroke="#ffffff" stroke-opacity="0.22" stroke-width="0.7" fill="none" stroke-linecap="round"/>
  ${flake(11, 11, 3.5, 0.35)}
  ${flake(28, 26, 4, 0.3)}
  ${flake(30, 8, 2.2, 0.25)}
  ${flake(9, 32, 2.5, 0.25)}
</svg>`;
}

/** Number of worn looks after the untouched one. */
export const THORN_WEAR_STAGES = 4;

/** The thorn hooks, in the order they fall off. */
const THORN_HOOKS = ['M24,9 C26,6 28,8 26,11', 'M10,13 C12,10 14,11 12,14', 'M30,15 C32,12 34,13 32,16'];
/** A fallen hook lying flat under the vine, one per lost hook (same order). */
const FALLEN_HOOKS = ['M23,18 l3,-1', 'M9,18 l3,1', 'M31,19 l3,-1'];

/**
 * A thorny vine tile at `stage` of wear (0 = untouched, THORN_WEAR_STAGES = nearly gone). The hooks
 * drop off one at a time and lie faded under the vine, then the vines thin, dim and snap. Kept
 * low-key so a worn patch reads as "thinning", not as a new effect.
 */
function thornVineSvg(c: ThornVineColours, stage: number): string {
    const hooksLost = Math.min(THORN_HOOKS.length, stage);
    const vineAlpha = [1, 0.95, 0.88, 0.78, 0.65][stage] ?? 0.65;
    const vineWidth = stage >= 3 ? 1.2 : 1.5;
    // The main vine stays whole until the last stage, then snaps in the middle.
    const vine = stage >= 4
        ? `<path d="M2,15 C8,8 12,18 17,11" stroke="${c.vine}" stroke-width="${vineWidth}" fill="none" stroke-linecap="round" stroke-opacity="${vineAlpha}"/>
  <path d="M22,8 C26,5 29,15 36,12" stroke="${c.vine}" stroke-width="${vineWidth}" fill="none" stroke-linecap="round" stroke-opacity="${vineAlpha}"/>`
        : `<path d="M2,15 C8,8 12,18 18,10 C24,2 28,16 36,12" stroke="${c.vine}" stroke-width="${vineWidth}" fill="none" stroke-linecap="round" stroke-opacity="${vineAlpha}"/>`;
    // The under-vine breaks first (stage 3), then shrinks to a stub.
    const underVine = stage >= 4
        ? `<path d="M5,18 C10,12 14,18 18,15" stroke="${c.underVine}" stroke-width="0.8" fill="none" stroke-linecap="round" stroke-opacity="${vineAlpha}"/>`
        : stage >= 3
            ? `<path d="M5,18 C10,12 16,19 20,15" stroke="${c.underVine}" stroke-width="1" fill="none" stroke-linecap="round" stroke-opacity="${vineAlpha}"/>
  <path d="M25,12 C29,10 33,17 38,13" stroke="${c.underVine}" stroke-width="1" fill="none" stroke-linecap="round" stroke-opacity="${vineAlpha}"/>`
            : `<path d="M5,18 C10,12 16,19 22,14 C28,9 33,17 38,13" stroke="${c.underVine}" stroke-width="1" fill="none" stroke-linecap="round" stroke-opacity="${vineAlpha}"/>`;
    const hooks = THORN_HOOKS.slice(hooksLost)
        .map((d) => `<path d="${d}" stroke="${c.thorn}" stroke-width="1" fill="none" stroke-opacity="${vineAlpha}"/>`)
        .join(' ');
    // Fallen hooks fade as the patch wears on; gone entirely by the last stage.
    const fallenAlpha = stage >= 4 ? 0 : 0.45;
    const fallen = FALLEN_HOOKS.slice(0, hooksLost)
        .map((d) => `<path d="${d}" stroke="${c.thorn}" stroke-width="0.8" fill="none" stroke-linecap="round" stroke-opacity="${fallenAlpha}"/>`)
        .join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">
  ${fallen}
  ${vine}
  ${underVine}
  ${hooks}
</svg>`;
}

/** The THORN_WEAR_STAGES worn looks for a vine colour scheme (stages 1..N). */
function thornVineWornSvgs(c: ThornVineColours): string[] {
    return Array.from({ length: THORN_WEAR_STAGES }, (_, i) => thornVineSvg(c, i + 1));
}

export const TERRAIN_EFFECT_VISUAL_DEFS: Record<string, TerrainEffectVisualDef> = {
    dark_thorn: {
        layer: 'ground',
        svgString: thornVineSvg(DARK_THORN_COLOURS, 0),
        wornSvgStrings: thornVineWornSvgs(DARK_THORN_COLOURS),
    },
    bramble_slow: {
        layer: 'ground',
        svgString: thornVineSvg(BRAMBLE_COLOURS, 0),
        wornSvgStrings: thornVineWornSvgs(BRAMBLE_COLOURS),
    },
    miasma: {
        layer: 'air',
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">
  <ellipse cx="12" cy="12" rx="11" ry="6" fill="#6b7f3a" fill-opacity="0.35"/>
  <ellipse cx="26" cy="9" rx="12" ry="7" fill="#556b2f" fill-opacity="0.35"/>
  <ellipse cx="20" cy="14" rx="14" ry="5" fill="#4a3b5c" fill-opacity="0.3"/>
  <path d="M6,11 C10,7 14,13 18,9 M22,12 C26,8 30,13 35,9" stroke="#a3b86c" stroke-opacity="0.5" stroke-width="1" fill="none" stroke-linecap="round"/>
</svg>`,
        lifetimeFade: { endScale: 0.7, endAlpha: 0.7 },
        exit: { durationSec: 0.25, endScale: 0.2, endAlpha: 0 },
    },
    frozen_field: {
        layer: 'ground',
        footprint: 'fullCell',
        svgString: frostSheetSvg(WATER_THEME.primary, WATER_THEME.secondary ?? WATER_THEME.primary, WATER_THEME.font ?? WATER_THEME.primary),
        lifetimeFade: { endScale: 1, endAlpha: 0.6 },
        exit: { durationSec: 0.3, endScale: 1.05, endAlpha: 0 },
    },
};
