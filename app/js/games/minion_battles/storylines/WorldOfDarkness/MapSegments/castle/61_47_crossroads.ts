/**
 * 61_47 Crossroads - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Outdoor four-way crossing north of the courtyard, among trees (rock trunks in thick-grass
 * undergrowth). Exits: north (4-wide) to the great hall, south (4-wide) to the courtyard, east
 * (3-wide) into the garden, and west (3-wide) into the walled barracks lane (60_47).
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;

export const SEGMENT_61_47_CROSSROADS: CastleSegment = {
    id: '61_47_crossroads',
    gridCol: 61,
    gridRow: 47,
    description: 'Where the roads from the gate, the keep, the gardens and the barracks met, shaded by old trees left standing when the castle was built.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, D, D, D, D, B, B, B, B, B, B, B, B, B],
        [D, D, D, _, _, _, _, _, _, D, D, D, D, _, _, _, _, _, _, _, _, B],
        [D, D, D, D, _, T, T, T, _, D, D, D, D, _, _, T, T, T, T, _, _, B],
        [D, D, D, D, _, T, R, T, _, D, D, D, D, _, _, T, R, R, T, _, _, B],
        [B, D, D, D, D, T, T, T, _, D, D, D, D, _, _, T, R, R, T, _, _, B],
        [B, D, D, D, D, _, _, _, _, D, D, D, D, _, _, T, T, T, T, _, _, B],
        [B, D, D, D, D, _, _, _, _, D, D, D, D, _, _, _, _, _, T, T, T, B],
        [B, _, D, D, D, D, _, D, D, D, D, D, D, D, D, _, _, _, R, T, T, B],
        [B, _, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, T, T, T, B],
        [B, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, _, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, _, _, _, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _, _, _, B],
        [B, _, _, _, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _, _, _, B],
        [B, _, T, T, T, T, _, _, _, D, D, D, D, _, _, T, T, T, T, _, _, B],
        [B, _, T, R, R, T, _, _, _, D, D, D, D, _, _, T, R, R, T, _, _, B],
        [B, _, T, R, R, T, _, _, _, D, D, D, D, _, _, T, R, R, T, _, _, B],
        [B, _, T, T, T, T, _, _, _, D, D, D, D, T, T, T, T, T, T, _, _, B],
        [B, T, T, T, _, T, R, T, _, D, D, D, D, T, R, T, _, _, R, T, T, B],
        [B, T, T, T, _, T, T, T, _, D, D, D, D, T, T, T, _, _, T, T, T, B],
        [B, T, T, T, _, T, T, T, _, D, D, D, D, _, _, _, _, _, T, T, T, B],
        [B, B, B, B, B, B, B, B, B, D, D, D, D, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // Middle of the crossing.
        { id: '61_47_crossing', label: 'Crossing', col: 10, row: 10, type: 'patrol_point' },
        // Under the north-east trees.
        { id: '61_47_trees_northeast', label: 'North-east Trees', col: 18, row: 4, type: 'enemySpawn' },
        // Under the south-west trees.
        { id: '61_47_trees_southwest', label: 'South-west Trees', col: 5, row: 16, type: 'enemySpawn' },
        // Under the south-east trees.
        { id: '61_47_trees_southeast', label: 'South-east Trees', col: 18, row: 16, type: 'enemySpawn' },
        // On the road just north of the courtyard: where missions that start at the crossroads begin.
        { id: '61_47_entry_south', label: 'Entry: South', col: 10, row: 19, type: 'generic', tags: ['entry'] },
        // At the great hall door: where the crossroads mission ends.
        { id: '61_47_exit_north', label: 'Exit: North', col: 10, row: 1, type: 'generic', tags: ['exit'] },
    ],
    network: {
        nodes: [{ id: '61_47_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_48_keep_door', '61_47_center'],
        ],
    },
};
