/**
 * 61_46 Great Hall - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Feasting hall and the door into the keep: from the crossroads (south) the walk leads north onto
 * the chasm bridge, and the wing runs west into the barracks yard and east into the chapel yard
 * through the gap between the long tables. A split high table at the north end.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;

export const SEGMENT_61_46_GREAT_HALL: CastleSegment = {
    id: '61_46_great_hall',
    gridCol: 61,
    gridRow: 46,
    description: "The heart of a castle's daily life: the household ate, feasted and heard disputes here, and many servants slept on its floor. The lord's table stood on a raised dais.",
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
        [B, G, G, G, G, G, G, G, D, D, D, D, D, D, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, B, B, B, D, D, D, D, B, B, B, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, B, G, G, B, D, D, D, D, D, G, B, G, G, B, G, G, G, B],
        [B, G, G, G, B, G, G, B, D, D, D, D, D, G, B, G, G, B, G, G, G, B],
        [B, G, G, G, B, G, G, B, D, D, D, D, D, G, B, G, G, B, G, G, G, B],
        [B, D, D, G, B, G, G, B, D, D, D, D, D, G, B, G, G, B, G, D, D, B],
        [B, D, D, D, B, D, D, B, D, D, D, D, D, D, B, D, D, B, D, D, D, B],
        [D, D, D, D, B, D, D, B, D, D, D, D, D, D, B, D, D, B, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [B, D, D, D, B, D, D, B, D, D, D, D, D, D, B, D, D, B, D, D, D, B],
        [B, D, D, G, B, G, G, B, D, D, D, D, D, G, B, G, G, B, G, D, D, B],
        [B, G, G, G, B, G, G, B, D, D, D, D, D, G, B, G, G, B, G, G, G, B],
        [B, G, G, G, B, G, G, B, D, D, D, D, D, G, B, G, G, B, G, G, G, B],
        [B, G, G, G, B, G, G, B, D, D, D, D, D, G, B, G, G, B, G, G, G, B],
        [B, G, G, G, B, G, G, B, D, D, D, D, D, G, B, G, G, B, G, G, G, B],
        [B, G, G, G, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, D, D, D, D, D, D, D, D, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, D, D, D, D, D, D, D, D, G, G, G, G, G, G, B],
        [B, B, B, B, B, B, B, B, B, D, D, D, D, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // Walkway between the tables.
        { id: '61_46_great_hall_center', label: 'Great Hall Center', col: 10, row: 14, type: 'patrol_point' },
        // Between the two halves of the high table.
        { id: '61_46_great_hall_high_table', label: 'High Table', col: 10, row: 2, type: 'generic' },
        // Along the west wall behind the tables.
        { id: '61_46_great_hall_west', label: 'Great Hall West Benches', col: 2, row: 15, type: 'enemySpawn' },
        // Along the east wall behind the tables.
        { id: '61_46_great_hall_east', label: 'Great Hall East Benches', col: 19, row: 15, type: 'enemySpawn' },
        // Just inside the door from the crossroads: where the great-hall mission starts.
        { id: '61_46_entry_south', label: 'Entry: South', col: 10, row: 19, type: 'generic', tags: ['entry'] },
    ],
    network: {
        nodes: [{ id: '61_46_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_47_center', '61_46_center'],
        ],
    },
};
