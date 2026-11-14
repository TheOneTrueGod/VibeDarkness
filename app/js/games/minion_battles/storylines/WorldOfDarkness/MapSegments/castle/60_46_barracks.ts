/**
 * 60_46 Barracks - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Barracks yard west of the great hall (row 46 is the outdoor-to-indoor transition). Two
 * bunkhouses flank the path up from the barracks lane (south door, 60_47); a drill square with a
 * practice post and weapon racks fills the north. The wing path crosses on rows 9-11: west to
 * the portcullis hall, east to the great hall. No door north to the royal chambers.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;

export const SEGMENT_60_46_BARRACKS: CastleSegment = {
    id: '60_46_barracks',
    gridCol: 60,
    gridRow: 46,
    description: 'Sleeping and living quarters for the garrison: two long bunkhouses in a yard with a drill square. Barracks sat close to the gates so soldiers could turn out quickly.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, B],
        [B, _, G, G, G, _, _, _, _, _, _, _, _, _, _, _, _, G, G, G, _, B],
        [B, _, G, B, G, _, D, D, D, D, D, D, D, D, D, D, _, G, B, G, _, B],
        [B, _, G, G, G, _, D, D, D, D, D, D, D, D, D, D, _, G, G, G, _, B],
        [B, _, _, _, _, _, D, D, D, D, B, B, D, D, D, D, _, _, _, _, _, B],
        [B, _, G, G, G, _, D, D, D, D, B, B, D, D, D, D, _, G, G, G, _, B],
        [B, _, G, B, G, _, D, D, D, D, D, D, D, D, D, D, _, G, B, G, _, B],
        [B, _, G, G, G, _, _, _, _, _, D, D, _, _, _, _, _, G, G, G, _, B],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _, _, _, _, B],
        [B, B, B, B, B, B, B, B, B, _, D, D, _, B, B, B, B, B, B, B, B, B],
        [B, G, B, G, B, G, B, G, B, _, D, D, _, B, G, B, G, B, G, B, G, B],
        [B, G, B, G, B, G, B, G, B, _, D, D, _, B, G, B, G, B, G, B, G, B],
        [B, G, G, G, G, G, G, G, D, _, D, D, _, D, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, D, _, D, D, _, D, G, G, G, G, G, G, G, B],
        [B, G, B, G, B, G, B, G, B, _, D, D, _, B, G, B, G, B, G, B, G, B],
        [B, G, B, G, B, G, B, G, B, _, D, D, _, B, G, B, G, B, G, B, G, B],
        [B, B, B, B, B, B, B, B, B, _, D, D, _, B, B, B, B, B, B, B, B, B],
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // On the drill square, west of the practice post.
        { id: '60_46_drill_yard', label: 'Drill Square', col: 8, row: 6, type: 'patrol_point' },
        // Inside the west bunkhouse.
        { id: '60_46_barracks_bunks_west', label: 'West Bunkhouse', col: 3, row: 16, type: 'enemySpawn' },
        // Inside the east bunkhouse.
        { id: '60_46_barracks_bunks_east', label: 'East Bunkhouse', col: 18, row: 16, type: 'enemySpawn' },
        // On the path just inside the door from the barracks lane: where the barracks-wing mission starts.
        { id: '60_46_entry_south', label: 'Entry: South', col: 10, row: 19, type: 'generic', tags: ['entry'] },
    ],
    network: {
        nodes: [{ id: '60_46_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_46_center', '60_46_center'],
        ],
    },
};
