/**
 * 60_48 Sparring Pit - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * South-east quarter of the training ring: a round dirt sparring pit with a gravel rim and four
 * corner posts. 4-wide door east to the courtyard (61_48), the training ring's only way in;
 * 2-wide door south to the west guardhouse (60_49).
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;

export const SEGMENT_60_48_SPARRING_PIT: CastleSegment = {
    id: '60_48_sparring_pit',
    gridCol: 60,
    gridRow: 48,
    description: 'A ring of beaten earth where soldiers practised swordplay and wrestling, watched by their sergeants from the rim.',
    terrain: [
        [_, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _, B],
        [_, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _, B],
        [_, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, _, B],
        [_, _, _, _, _, _, _, G, G, D, D, G, G, _, _, _, _, _, _, _, _, B],
        [_, _, _, _, _, _, G, G, D, D, D, D, G, G, _, _, _, _, _, _, _, B],
        [_, _, _, _, _, R, D, D, D, D, D, D, D, D, R, _, _, _, _, _, _, B],
        [_, _, _, _, G, D, D, D, D, D, D, D, D, D, D, G, _, _, _, _, _, B],
        [_, _, _, G, G, D, D, D, D, D, D, D, D, D, D, G, G, _, _, _, _, B],
        [_, _, _, G, D, D, D, D, D, D, D, D, D, D, D, D, G, _, _, _, _, B],
        [_, _, _, G, D, D, D, D, D, D, D, D, D, D, D, D, G, _, _, _, _, B],
        [_, _, _, G, D, D, D, D, D, D, D, D, D, D, D, D, G, _, _, _, _, B],
        [_, _, _, G, D, D, D, D, D, D, D, D, D, D, D, D, G, _, _, _, _, B],
        [_, _, _, G, G, D, D, D, D, D, D, D, D, D, D, G, G, _, _, _, _, B],
        [_, _, _, _, G, D, D, D, D, D, D, D, D, D, D, G, _, _, _, _, _, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [_, _, _, _, _, _, _, G, G, G, D, D, G, _, _, _, _, _, _, _, _, D],
        [_, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, B],
        [_, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, B],
        [_, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, B],
        [_, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, B],
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // Middle of the pit.
        { id: '60_48_pit', label: 'Sparring Pit', col: 10, row: 10, type: 'patrol_point' },
        // Grass north-west of the pit.
        { id: '60_48_pit_northwest', label: 'North-west of the Pit', col: 2, row: 3, type: 'enemySpawn' },
        // Grass south-east of the pit.
        { id: '60_48_pit_southeast', label: 'South-east of the Pit', col: 17, row: 19, type: 'enemySpawn' },
        // Just inside the courtyard's west door: where the training-grounds mission starts.
        { id: '60_48_entry_east', label: 'Entry: East', col: 19, row: 14, type: 'generic', tags: ['entry'] },
    ],
    network: {
        nodes: [{ id: '60_48_center', position: { kind: 'gridPoint', col: 10, row: 14 }, tags: ['castle'] }],
        edges: [
            ['61_48_west_door', '60_48_center'],
        ],
    },
};
