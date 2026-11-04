export interface TerrainEffectVisualDef {
    layer: 'ground' | 'air';
    svgString: string;
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
}

export const TERRAIN_EFFECT_VISUAL_DEFS: Record<string, TerrainEffectVisualDef> = {
    dark_thorn: {
        layer: 'ground',
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">
  <path d="M2,15 C8,8 12,18 18,10 C24,2 28,16 36,12" stroke="#7c3aed" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M5,18 C10,12 16,19 22,14 C28,9 33,17 38,13" stroke="#5b21b6" stroke-width="1" fill="none" stroke-linecap="round"/>
  <path d="M10,13 C12,10 14,11 12,14" stroke="#a78bfa" stroke-width="1" fill="none"/>
  <path d="M24,9 C26,6 28,8 26,11" stroke="#a78bfa" stroke-width="1" fill="none"/>
  <path d="M30,15 C32,12 34,13 32,16" stroke="#a78bfa" stroke-width="1" fill="none"/>
</svg>`,
    },
    bramble_slow: {
        layer: 'ground',
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">
  <path d="M2,15 C8,8 12,18 18,10 C24,2 28,16 36,12" stroke="#22c55e" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  <path d="M5,18 C10,12 16,19 22,14 C28,9 33,17 38,13" stroke="#16a34a" stroke-width="1" fill="none" stroke-linecap="round"/>
  <path d="M10,13 C12,10 14,11 12,14" stroke="#4ade80" stroke-width="1" fill="none"/>
  <path d="M24,9 C26,6 28,8 26,11" stroke="#4ade80" stroke-width="1" fill="none"/>
  <path d="M30,15 C32,12 34,13 32,16" stroke="#4ade80" stroke-width="1" fill="none"/>
</svg>`,
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
};
