export interface FloorTileVisualDef {
    svgString: string;
}

/** Rock overlay tiers keyed by damage tier 0–3 (health percentage bands). */
export const ROCK_FLOOR_VISUAL_TIERS: FloorTileVisualDef[] = [
    {
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">
  <polygon points="20,2 38,10 20,18 2,10" fill="#8a8a8a" stroke="#5a5a5a" stroke-width="1"/>
  <path d="M8,11 L14,8 L20,12 L26,7 L32,11" stroke="#6e6e6e" stroke-width="1" fill="none"/>
</svg>`,
    },
    {
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">
  <polygon points="20,2 38,10 20,18 2,10" fill="#7a7a7a" stroke="#5a5a5a" stroke-width="1"/>
  <path d="M6,10 L12,7 L18,11 L24,6 L30,10" stroke="#555" stroke-width="1.2" fill="none"/>
  <path d="M10,14 L16,12" stroke="#444" stroke-width="1" fill="none"/>
</svg>`,
    },
    {
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">
  <polygon points="20,2 38,10 20,18 2,10" fill="#6a6a6a" stroke="#4a4a4a" stroke-width="1"/>
  <path d="M5,9 L11,6 L17,10 L23,5 L29,9" stroke="#444" stroke-width="1.5" fill="none"/>
  <path d="M8,14 L14,11 L20,14" stroke="#333" stroke-width="1.2" fill="none"/>
  <path d="M22,13 L28,10" stroke="#333" stroke-width="1" fill="none"/>
</svg>`,
    },
    {
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">
  <polygon points="20,2 38,10 20,18 2,10" fill="#5a5a5a" stroke="#3a3a3a" stroke-width="1" opacity="0.6"/>
</svg>`,
    },
];

export const RUBBLE_FLOOR_VISUAL: FloorTileVisualDef = {
    svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20">
  <polygon points="20,2 38,10 20,18 2,10" fill="#6b5b4f" stroke="#4a3f36" stroke-width="0.8" opacity="0.85"/>
  <circle cx="12" cy="11" r="1.5" fill="#8a7a6a"/>
  <circle cx="20" cy="9" r="1.2" fill="#7a6a5a"/>
  <circle cx="28" cy="12" r="1.4" fill="#9a8a7a"/>
  <circle cx="16" cy="14" r="1" fill="#6a5a4a"/>
  <circle cx="24" cy="13" r="0.9" fill="#5a4a3a"/>
</svg>`,
};
