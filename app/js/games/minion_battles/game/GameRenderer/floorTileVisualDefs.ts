export interface FloorTileVisualDef {
    svgString: string;
}

const CELL_CLIP = `<clipPath id="cell"><rect x="0" y="0" width="40" height="40"/></clipPath>`;

/** Crack/chip overlays only — bedrock rock tile shows through underneath. Indexed by tier 1–4. */
export const ROCK_FLOOR_VISUAL_TIERS: FloorTileVisualDef[] = [
    {
        // Tier 1: light cracks on otherwise intact rock
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <defs>${CELL_CLIP}</defs>
  <g clip-path="url(#cell)">
    <path d="M9,24 L15,18 L21,26" stroke="#7a7a7a" stroke-width="0.8" fill="none" stroke-linecap="round"/>
    <path d="M23,16 L28,20 L32,18" stroke="#8a8a8a" stroke-width="0.7" fill="none" stroke-linecap="round"/>
  </g>
</svg>`,
    },
    {
        // Tier 2: light cracks + small chip marks
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <defs>${CELL_CLIP}</defs>
  <g clip-path="url(#cell)">
    <path d="M7,22 L13,16 L19,24 L25,14 L31,22" stroke="#6e6e6e" stroke-width="0.9" fill="none" stroke-linecap="round"/>
    <path d="M11,28 L14,24" stroke="#555" stroke-width="0.8" fill="none" stroke-linecap="round"/>
    <path d="M26,26 L29,22" stroke="#555" stroke-width="0.8" fill="none" stroke-linecap="round"/>
    <path d="M18,12 L20,16" stroke="#666" stroke-width="0.7" fill="none" stroke-linecap="round"/>
  </g>
</svg>`,
    },
    {
        // Tier 3: darker cracks extending farther into the tile
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <defs>${CELL_CLIP}</defs>
  <g clip-path="url(#cell)">
    <path d="M5,20 L11,14 L17,22 L23,12 L29,20 L33,16" stroke="#555" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <path d="M8,28 L14,22 L20,30" stroke="#444" stroke-width="1" fill="none" stroke-linecap="round"/>
    <path d="M22,28 L28,22" stroke="#444" stroke-width="1" fill="none" stroke-linecap="round"/>
    <path d="M12,10 L14,16" stroke="#4a4a4a" stroke-width="0.8" fill="none" stroke-linecap="round"/>
    <path d="M24,32 L27,26" stroke="#4a4a4a" stroke-width="0.8" fill="none" stroke-linecap="round"/>
  </g>
</svg>`,
    },
    {
        // Tier 4: heaviest damage before rubble — long deep cracks and more chips
        svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <defs>${CELL_CLIP}</defs>
  <g clip-path="url(#cell)">
    <path d="M4,18 L10,12 L16,20 L22,10 L28,18 L34,14" stroke="#3a3a3a" stroke-width="1.3" fill="none" stroke-linecap="round"/>
    <path d="M6,28 L12,22 L18,30 L24,24" stroke="#333" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M26,30 L32,24" stroke="#333" stroke-width="1.1" fill="none" stroke-linecap="round"/>
    <path d="M10,8 L12,14 L9,18" stroke="#444" stroke-width="0.9" fill="none" stroke-linecap="round"/>
    <path d="M20,32 L23,26 L25,32" stroke="#444" stroke-width="0.9" fill="none" stroke-linecap="round"/>
    <path d="M30,10 L32,16" stroke="#3a3a3a" stroke-width="0.8" fill="none" stroke-linecap="round"/>
    <path d="M14,34 L17,28" stroke="#3a3a3a" stroke-width="0.8" fill="none" stroke-linecap="round"/>
  </g>
</svg>`,
    },
];

export const RUBBLE_FLOOR_VISUAL: FloorTileVisualDef = {
    svgString: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
  <polygon points="6,9 11,8 12,13 7,14" fill="#8a7a6a" opacity="0.7"/>
  <polygon points="23,6 28,8 27,12 22,11" fill="#7a6a5a" opacity="0.65"/>
  <polygon points="4,23 9,21 10,27 5,28" fill="#5a4a3a" opacity="0.7"/>
  <polygon points="28,19 33,18 34,24 29,25" fill="#9a8a7a" opacity="0.6"/>
  <polygon points="16,29 21,27 22,33 17,34" fill="#6a5a4a" opacity="0.7"/>
  <polygon points="17,12 22,11 23,16 18,17" fill="#7a6b5b" opacity="0.6"/>
  <polygon points="30,29 35,27 36,32 31,33" fill="#8a7a6a" opacity="0.65"/>
  <polygon points="10,19 14,18 15,22 11,23" fill="#5a4a3a" opacity="0.55"/>
  <polygon points="25,31 29,30 30,35 26,36" fill="#7a6a5a" opacity="0.6"/>
</svg>`,
};
