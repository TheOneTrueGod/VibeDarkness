/**
 * 60_44 Royal Solar - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A sitting room with a hearth, a table on a rug, and a window alcove with seats (north-east,
 * 2-wide door). North-east room of the royal chambers: 2-wide doors west to the master bedroom
 * and south to the privy chamber; no doors to the throne room or the north stair tower.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;

export const SEGMENT_60_44_ROYAL_SOLAR: CastleSegment = {
    id: '60_44_royal_solar',
    gridCol: 60,
    gridRow: 44,
    description: 'An upper sitting room for the royal family, named for the sunlight from its large windows: a private place to read, sew, play music and talk away from the bustle of the hall.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, G, G, G, G, B, B, G, G, G, G, G, G, B, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, B, G, G, G, G, G, G, B, B],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, B, G, G, G, G, G, G, G, B],
        [B, G, G, B, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, B, B],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, B, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, B, B, B, B, B, B, B, B, B],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, B],
        [D, D, D, D, D, D, D, D, D, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, _, _, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, B, B, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, B, B, _, _, G, G, G, B],
        [B, G, G, B, G, G, G, G, G, G, D, D, _, _, _, _, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, _, _, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, B, G, B],
        [B, G, G, G, B, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // Where the route from the bedroom turns south.
        { id: '60_44_royal_solar', label: 'Royal Solar', col: 10, row: 12, type: 'patrol_point' },
        // In the window alcove.
        { id: '60_44_window_alcove', label: 'Window Alcove', col: 17, row: 4, type: 'enemySpawn' },
        // In front of the hearth.
        { id: '60_44_hearth', label: 'Hearth', col: 5, row: 2, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_44_center', position: { kind: 'gridPoint', col: 10, row: 11 }, tags: ['castle'] }],
        edges: [],
    },
};
