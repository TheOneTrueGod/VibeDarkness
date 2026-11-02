/**
 * 63_46 Chapel Altar - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Cross-shaped transept with the altar at the crossing, on a grass dais, and four side chapels.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;

export const SEGMENT_63_46_CHAPEL_ALTAR: CastleSegment = {
    id: '63_46_chapel_altar',
    gridCol: 63,
    gridRow: 46,
    description: 'The chancel at the far end of the chapel, holding the altar, where the priest led services.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, G, G, G, G, G, D, D, D, D, G, G, R, R, R, R, R, R, R],
        [R, R, R, R, G, G, G, G, G, D, D, D, G, G, G, R, G, G, G, G, R, R],
        [R, R, R, R, G, G, G, G, G, D, D, D, G, G, G, R, G, G, G, G, R, R],
        [R, R, R, R, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, R, R],
        [R, R, R, R, G, G, G, G, G, D, D, D, G, G, G, R, G, G, G, G, R, R],
        [R, R, R, R, G, G, G, G, G, D, D, D, G, G, G, R, R, R, R, R, R, R],
        [R, G, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, D, G, G, G, G, G, G, _, _, _, _, _, _, G, G, G, G, G, G, G, R],
        [D, D, G, G, G, G, G, G, _, _, R, R, _, _, G, G, G, G, G, G, D, R],
        [D, D, D, G, G, G, G, G, _, _, R, R, _, _, G, G, G, G, G, D, D, D],
        [D, D, D, D, G, G, G, G, _, _, R, R, _, _, G, G, G, G, D, D, D, D],
        [R, D, D, D, D, D, D, D, _, _, _, _, _, _, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R],
        [R, R, G, G, G, G, R, D, D, D, D, D, D, D, D, R, G, G, G, G, R, R],
        [R, R, G, G, G, G, R, G, D, D, D, D, D, D, G, R, G, G, G, G, R, R],
        [R, R, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, R, R],
        [R, R, G, G, G, G, R, G, G, D, D, D, G, G, G, R, G, G, G, G, R, R],
        [R, R, G, G, G, G, R, G, G, D, D, D, G, G, G, R, G, G, G, G, R, R],
        [R, R, R, R, R, R, R, G, G, D, D, D, D, G, G, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Before the altar.
        { id: '63_46_chapel_altar', label: 'Altar', col: 10, row: 8, type: 'generic' },
        // South arm of the transept.
        { id: '63_46_chapel_transept', label: 'Transept', col: 10, row: 15, type: 'patrol_point' },
        // South-west side chapel.
        { id: '63_46_chapel_side_west', label: 'West Side Chapel', col: 3, row: 17, type: 'enemySpawn' },
        // North-east side chapel.
        { id: '63_46_chapel_side_east', label: 'East Side Chapel', col: 17, row: 3, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '63_46_center', position: { kind: 'gridPoint', col: 10, row: 15 }, tags: ['castle'] }],
        edges: [
            ['62_46_center', '63_46_center'],
            ['63_45_center', '63_46_center'],
        ],
    },
};
