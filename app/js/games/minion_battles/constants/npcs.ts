/**
 * Static NPC definitions for level events, chat messages, and story segments.
 * Each NPC has an id, name, color, and optional portrait (SVG or URL).
 */

export interface NpcDef {
    id: string;
    name: string;
    color: string;
    /** SVG string or image URL for story segment portraits. */
    portrait?: string;
}

/** Shadowy narrator silhouette for story segments. */
const NARRATOR_PORTRAIT = `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="narrator-bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1"/>
      <stop offset="100%" style="stop-color:#020617;stop-opacity:1"/>
    </linearGradient>
    <filter id="narrator-shadow">
      <feDropShadow dx="0" dy="2" stdDeviation="4" flood-opacity="0.6"/>
    </filter>
  </defs>
  <rect width="200" height="200" fill="url(#narrator-bg)"/>
  <ellipse cx="100" cy="140" rx="55" ry="45" fill="#1e293b" filter="url(#narrator-shadow)"/>
  <circle cx="100" cy="85" r="35" fill="#0f172a"/>
  <path d="M65 85 Q100 55 135 85" fill="#1e293b"/>
  <circle cx="100" cy="82" r="8" fill="#334155" opacity="0.9"/>
</svg>`;

/** NPC 1: Narrator - used for level event messages and pre-mission story. */
export const NPCS: Record<string, NpcDef> = {
    '1': {
        id: '1',
        name: 'Narrator',
        color: '#6b5b95', // slightly brighter purple
        portrait: NARRATOR_PORTRAIT,
    },
} as const;

export type NpcId = keyof typeof NPCS;

export function getNpc(id: string): NpcDef | undefined {
    return NPCS[id];
}
