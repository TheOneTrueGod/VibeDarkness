/**
 * Character definitions for Minion Battles.
 * Each character has a unique SVG portrait, enabled status, and associated cards.
 */
import type { CharacterDef } from './types';

function generateWarriorSVG(): string {
    return `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="warrior-bg" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#8B0000;stop-opacity:1"/>
                <stop offset="100%" style="stop-color:#4a0000;stop-opacity:1"/>
            </linearGradient>
        </defs>
        <rect width="200" height="200" fill="url(#warrior-bg)"/>
        <circle cx="100" cy="70" r="30" fill="#d4a574"/>
        <rect x="70" y="100" width="60" height="50" rx="5" fill="#8B4513"/>
        <rect x="55" y="105" width="15" height="35" rx="3" fill="#d4a574"/>
        <rect x="130" y="105" width="15" height="35" rx="3" fill="#d4a574"/>
        <rect x="140" y="90" width="8" height="55" fill="#a0a0a0"/>
        <rect x="136" y="85" width="16" height="8" fill="#a0a0a0"/>
        <rect x="80" y="55" width="40" height="12" rx="2" fill="#a0a0a0"/>
        <circle cx="90" cy="65" r="3" fill="#1a1a1a"/>
        <circle cx="110" cy="65" r="3" fill="#1a1a1a"/>
        <path d="M92 78 Q100 85 108 78" stroke="#1a1a1a" stroke-width="2" fill="none"/>
    </svg>`;
}

function generateMageSVG(): string {
    return `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="mage-bg" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#1a0a3e;stop-opacity:1"/>
                <stop offset="100%" style="stop-color:#0d0520;stop-opacity:1"/>
            </linearGradient>
            <radialGradient id="mage-glow" cx="50%" cy="50%">
                <stop offset="0%" style="stop-color:#9b59b6;stop-opacity:0.6"/>
                <stop offset="100%" style="stop-color:#9b59b6;stop-opacity:0"/>
            </radialGradient>
        </defs>
        <rect width="200" height="200" fill="url(#mage-bg)"/>
        <circle cx="100" cy="130" r="50" fill="url(#mage-glow)"/>
        <circle cx="100" cy="80" r="25" fill="#e8d5b7"/>
        <polygon points="70,70 100,20 130,70" fill="#4a148c"/>
        <rect x="75" y="105" width="50" height="55" rx="5" fill="#4a148c"/>
        <rect x="55" y="110" width="20" height="8" rx="3" fill="#4a148c"/>
        <rect x="125" y="110" width="20" height="8" rx="3" fill="#4a148c"/>
        <circle cx="50" cy="125" r="8" fill="#9b59b6" opacity="0.8"/>
        <circle cx="50" cy="125" r="4" fill="#e1bee7"/>
        <rect x="48" y="125" width="4" height="40" fill="#8B4513"/>
        <circle cx="92" cy="75" r="3" fill="#1a1a1a"/>
        <circle cx="108" cy="75" r="3" fill="#1a1a1a"/>
        <circle cx="92" cy="75" r="1" fill="#9b59b6"/>
        <circle cx="108" cy="75" r="1" fill="#9b59b6"/>
    </svg>`;
}

function generateRangerSVG(): string {
    return `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="ranger-bg" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#1b5e20;stop-opacity:1"/>
                <stop offset="100%" style="stop-color:#0a2e0a;stop-opacity:1"/>
            </linearGradient>
        </defs>
        <rect width="200" height="200" fill="url(#ranger-bg)"/>
        <circle cx="100" cy="75" r="25" fill="#d4a574"/>
        <rect x="75" y="100" width="50" height="50" rx="5" fill="#2e7d32"/>
        <rect x="55" y="105" width="20" height="10" rx="3" fill="#2e7d32"/>
        <rect x="125" y="105" width="20" height="10" rx="3" fill="#2e7d32"/>
        <path d="M80 50 Q100 40 120 50" fill="#4a2800"/>
        <rect x="135" y="70" width="4" height="60" fill="#8B4513"/>
        <line x1="125" y1="80" x2="145" y2="80" stroke="#c0c0c0" stroke-width="1.5"/>
        <path d="M125 80 L120 77 L120 83 Z" fill="#c0c0c0"/>
        <ellipse cx="70" cy="140" rx="8" ry="12" fill="#8B4513" opacity="0.8"/>
        <circle cx="92" cy="70" r="3" fill="#1a1a1a"/>
        <circle cx="108" cy="70" r="3" fill="#1a1a1a"/>
        <path d="M93 82 Q100 86 107 82" stroke="#1a1a1a" stroke-width="1.5" fill="none"/>
    </svg>`;
}

function generateHealerSVG(): string {
    return `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="healer-bg" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#f5f5dc;stop-opacity:1"/>
                <stop offset="100%" style="stop-color:#d4c89a;stop-opacity:1"/>
            </linearGradient>
            <radialGradient id="healer-glow" cx="50%" cy="50%">
                <stop offset="0%" style="stop-color:#ffd700;stop-opacity:0.4"/>
                <stop offset="100%" style="stop-color:#ffd700;stop-opacity:0"/>
            </radialGradient>
        </defs>
        <rect width="200" height="200" fill="url(#healer-bg)"/>
        <circle cx="100" cy="100" r="60" fill="url(#healer-glow)"/>
        <circle cx="100" cy="75" r="25" fill="#d4a574"/>
        <rect x="75" y="100" width="50" height="55" rx="5" fill="#f0f0f0"/>
        <rect x="95" y="110" width="10" height="30" fill="#ff0000"/>
        <rect x="85" y="120" width="30" height="10" fill="#ff0000"/>
        <rect x="55" y="105" width="20" height="10" rx="3" fill="#f0f0f0"/>
        <rect x="125" y="105" width="20" height="10" rx="3" fill="#f0f0f0"/>
        <circle cx="100" cy="55" r="12" fill="#ffd700" opacity="0.4"/>
        <circle cx="92" cy="70" r="3" fill="#4a90d9"/>
        <circle cx="108" cy="70" r="3" fill="#4a90d9"/>
        <path d="M93 82 Q100 87 107 82" stroke="#333" stroke-width="1.5" fill="none"/>
    </svg>`;
}

function generateRogueSVG(): string {
    return `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="rogue-bg" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#2c2c2c;stop-opacity:1"/>
                <stop offset="100%" style="stop-color:#0a0a0a;stop-opacity:1"/>
            </linearGradient>
        </defs>
        <rect width="200" height="200" fill="url(#rogue-bg)"/>
        <circle cx="100" cy="75" r="25" fill="#c4a882"/>
        <rect x="75" y="100" width="50" height="50" rx="5" fill="#1a1a1a"/>
        <rect x="55" y="105" width="20" height="10" rx="3" fill="#1a1a1a"/>
        <rect x="125" y="105" width="20" height="10" rx="3" fill="#1a1a1a"/>
        <path d="M70 70 Q100 60 130 70" fill="#333"/>
        <rect x="75" y="65" width="50" height="8" fill="#333" rx="2"/>
        <rect x="60" y="130" width="4" height="25" fill="#c0c0c0" transform="rotate(-15 62 142)"/>
        <rect x="136" y="130" width="4" height="25" fill="#c0c0c0" transform="rotate(15 138 142)"/>
        <circle cx="92" cy="72" r="3" fill="#1a1a1a"/>
        <circle cx="108" cy="72" r="3" fill="#1a1a1a"/>
        <path d="M95 83 L105 83" stroke="#1a1a1a" stroke-width="1.5"/>
    </svg>`;
}

function generateNecromancerSVG(): string {
    return `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="necro-bg" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style="stop-color:#1a0a2e;stop-opacity:1"/>
                <stop offset="100%" style="stop-color:#000000;stop-opacity:1"/>
            </linearGradient>
            <radialGradient id="necro-glow" cx="50%" cy="50%">
                <stop offset="0%" style="stop-color:#00ff00;stop-opacity:0.3"/>
                <stop offset="100%" style="stop-color:#00ff00;stop-opacity:0"/>
            </radialGradient>
        </defs>
        <rect width="200" height="200" fill="url(#necro-bg)"/>
        <circle cx="100" cy="140" r="50" fill="url(#necro-glow)"/>
        <circle cx="100" cy="75" r="22" fill="#b8b8b8"/>
        <polygon points="75,68 100,25 125,68" fill="#1a1a1a"/>
        <rect x="78" y="97" width="44" height="55" rx="5" fill="#1a1a1a"/>
        <rect x="58" y="100" width="20" height="10" rx="3" fill="#1a1a1a"/>
        <rect x="122" y="100" width="20" height="10" rx="3" fill="#1a1a1a"/>
        <circle cx="92" cy="72" r="4" fill="#00ff00" opacity="0.8"/>
        <circle cx="108" cy="72" r="4" fill="#00ff00" opacity="0.8"/>
        <circle cx="92" cy="72" r="2" fill="#000"/>
        <circle cx="108" cy="72" r="2" fill="#000"/>
        <path d="M93 84 Q100 80 107 84" stroke="#666" stroke-width="1.5" fill="none"/>
        <rect x="48" y="110" width="3" height="45" fill="#555"/>
        <circle cx="50" cy="105" r="8" fill="#00ff00" opacity="0.5"/>
    </svg>`;
}

export const CHARACTERS: CharacterDef[] = [
    {
        id: 'warrior',
        name: 'Warrior',
        picture: generateWarriorSVG(),
        enabled: true,
        cards: ['0101', 'example_card'],
    },
    {
        id: 'mage',
        name: 'Mage',
        picture: generateMageSVG(),
        enabled: true,
        cards: ['example_card'],
    },
    {
        id: 'ranger',
        name: 'Ranger',
        picture: generateRangerSVG(),
        enabled: true,
        cards: ['example_card'],
    },
    {
        id: 'healer',
        name: 'Healer',
        picture: generateHealerSVG(),
        enabled: true,
        cards: ['example_card'],
    },
    {
        id: 'rogue',
        name: 'Rogue',
        picture: generateRogueSVG(),
        enabled: false,
        cards: ['example_card'],
    },
    {
        id: 'necromancer',
        name: 'Necromancer',
        picture: generateNecromancerSVG(),
        enabled: false,
        cards: ['example_card'],
    },
];

/** Map of character ID -> CharacterDef for quick lookups */
export const CHARACTER_MAP: Map<string, CharacterDef> = new Map(
    CHARACTERS.map((c) => [c.id, c])
);

export function getCharacterDef(id: string): CharacterDef | undefined {
    return CHARACTER_MAP.get(id);
}
