export interface TerrainEffectVisualDef {
    layer: 'ground' | 'air';
    svgString: string;
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
};
