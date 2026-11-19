/**
 * The Garden Heart - Chapter 3 boss. The whole garden, four segments stitched round the pond (queen's garden 62_47,
 * conservatory 63_47, herb garden 62_48, orchard 63_48), entered from the crossroads' east road. The Heart starts on
 * the loop path north of the pond with its phase-1 tree; at 75 / 50 / 25% it retreats to one of the authored sprout
 * points (`card_defs/16_enemy_garden_heart/gardenHeartPhases.ts`). No escort: the fight is the plant. Grants the
 * Reactions knowledge when the battle starts.
 */

import { chapter3Scripts } from '../../../../../storylines/worldOfDarkness/chapter3.script';
import { SEGMENT_62_47_QUEENS_GARDEN } from '../MapSegments/castle/62_47_queens_garden';
import { SEGMENT_63_47_CONSERVATORY } from '../MapSegments/castle/63_47_conservatory';
import { SEGMENT_62_48_HERB_GARDEN } from '../MapSegments/castle/62_48_herb_garden';
import { SEGMENT_63_48_ORCHARD } from '../MapSegments/castle/63_48_orchard';
import { KNOWLEDGE_REACTIONS } from '../../../../../accountKnowledge';
import { gardenHeartBossSetup } from './castle/castleBosses';
import { castlePoi, defineCastleMission } from './castle/castleMission';
import { CRYSTAL_TILE_DEFAULTS, DARK_CRYSTAL_TILE_DEFAULTS } from '../MapSegments/50_50_crystal_cave';
import { mirrorFourWays } from '../../placementSymmetry';
import type { SpecialTilePlacement } from '../../types';

export const GARDEN_HEART_MISSION_ID = 'garden_heart';

const SCRIPT = chapter3Scripts.garden_heart;

/** The central pond's centre: the corner where the four rooms meet (mission-global cells). */
const POND_CENTRE = { col: 21.5, row: 21.5 };

/**
 * Corrupted crystals ringing the pond, authored in the north-west quarter and mirrored into the
 * other three (12 in all). Each cell and its mirrors are open ground, off the paths and clear of
 * the sprout points.
 */
/**
 * The garden's corrupted crystals give plain, untinted light: no purple `colorFilter` square and FireLight (the
 * untinted default channel) instead of DarkLight's purple wash, which made the garden's terrain hard to read.
 */
const { colorFilter: _gardenNoFilter, ...DARK_CRYSTAL_NO_FILTER } = DARK_CRYSTAL_TILE_DEFAULTS;
const GARDEN_DARK_CRYSTAL: Omit<SpecialTilePlacement, 'col' | 'row'> = {
    ...DARK_CRYSTAL_NO_FILTER,
    emitsLight: { ...DARK_CRYSTAL_TILE_DEFAULTS.emitsLight!, lightType: 'FireLight' },
};

const CORRUPTED_CRYSTALS = mirrorFourWays(
    [
        { ...GARDEN_DARK_CRYSTAL, col: 12, row: 12 }, // diagonal, where the loop paths cross
        { ...GARDEN_DARK_CRYSTAL, col: 18, row: 14 }, // north shore
        { ...GARDEN_DARK_CRYSTAL, col: 12, row: 18 }, // west shore
    ],
    POND_CENTRE,
);

/** Two clean crystals against the west wall, either side of the entrance (mission-global cells). */
const ENTRANCE_CRYSTALS: SpecialTilePlacement[] = [
    { ...CRYSTAL_TILE_DEFAULTS, col: 1, row: 8 },
    { ...CRYSTAL_TILE_DEFAULTS, col: 1, row: 12 },
];

/** Every light in the garden is this much stronger and wider than its cave default. */
export const GARDEN_LIGHT_BOOST = { lightAmount: 2, radius: 3 };

function boostLight(p: SpecialTilePlacement): SpecialTilePlacement {
    if (!p.emitsLight) return p;
    return {
        ...p,
        emitsLight: {
            ...p.emitsLight,
            lightAmount: p.emitsLight.lightAmount + GARDEN_LIGHT_BOOST.lightAmount,
            radius: p.emitsLight.radius + GARDEN_LIGHT_BOOST.radius,
        },
    };
}

const GARDEN_LIGHTS = [...CORRUPTED_CRYSTALS, ...ENTRANCE_CRYSTALS].map(boostLight);

export const GARDEN_HEART = defineCastleMission({
    id: GARDEN_HEART_MISSION_ID,
    name: SCRIPT.name,
    description: SCRIPT.description,
    preMissionStory: SCRIPT.preMissionStory,
    rooms: [
        SEGMENT_62_47_QUEENS_GARDEN.id,
        SEGMENT_63_47_CONSERVATORY.id,
        SEGMENT_62_48_HERB_GARDEN.id,
        SEGMENT_63_48_ORCHARD.id,
    ],
    entry: castlePoi(SEGMENT_62_47_QUEENS_GARDEN, '62_47_entry_west'),
    spawnPreset: 'castle_boss_alone',
    // Stays where the two-room fight sat on the Mission Map (the stitched arena's centre would move it).
    mapNode: { col: 62.5, row: 47 },
    startRewards: { knowledgeKeys: [KNOWLEDGE_REACTIONS] },
    specialTiles: GARDEN_LIGHTS,
    boss: {
        kind: 'custom',
        poi: castlePoi(SEGMENT_62_47_QUEENS_GARDEN, '62_47_boss'),
        setup: (centre) => gardenHeartBossSetup(centre, SCRIPT.objectives.defeat_boss),
    },
});
