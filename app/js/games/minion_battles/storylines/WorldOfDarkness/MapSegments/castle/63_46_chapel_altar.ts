/**
 * 63_46 Chapel Altar - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * East half of the chapel yard: the transept (2-wide doors north and south into the churchyard)
 * and the chancel, with the altar on a grass dais. The churchyard path runs round the chancel to
 * a 2-wide door east to the breach (64_46).
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

export const SEGMENT_63_46_CHAPEL_ALTAR: CastleSegment = {
    id: '63_46_chapel_altar',
    gridCol: 63,
    gridRow: 46,
    description: 'The chancel at the far end of the chapel, holding the altar, where the priest led services.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, B],
        [_, R, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, B],
        [_, _, _, _, B, B, B, D, D, B, B, B, B, _, _, R, _, _, R, _, _, B],
        [_, _, _, _, B, G, G, D, D, G, G, G, B, _, _, _, _, _, _, _, _, B],
        [B, B, B, B, B, G, G, D, D, G, G, G, B, _, _, _, _, _, _, _, _, B],
        [G, G, G, G, G, G, G, D, D, G, G, G, B, B, B, B, B, B, B, _, _, B],
        [G, B, G, B, G, G, G, D, D, G, G, G, G, G, G, G, G, G, B, _, _, B],
        [G, B, G, B, G, G, G, D, D, G, G, G, G, G, _, _, _, _, B, _, _, B],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _, B, B, B, _, _, B],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _, B, B, B, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _, B, B, B, D, D, D],
        [G, B, G, B, G, G, G, D, D, G, G, G, G, G, _, _, _, _, B, D, D, B],
        [G, B, G, B, G, G, G, D, D, G, G, G, G, G, G, G, G, G, B, D, D, B],
        [G, G, G, G, G, G, G, D, D, G, G, G, B, B, B, B, B, B, B, D, D, B],
        [B, B, B, B, B, G, G, D, D, G, G, G, B, _, _, _, _, _, _, D, D, B],
        [_, _, _, _, B, G, G, D, D, G, G, G, B, _, _, R, _, _, R, D, D, B],
        [_, _, _, _, B, B, B, D, D, B, B, B, B, _, _, _, _, _, _, D, D, B],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, B],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, B],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, B],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Before the altar.
        { id: '63_46_chapel_altar', label: 'Altar', col: 14, row: 10, type: 'generic' },
        // South arm of the transept.
        { id: '63_46_chapel_transept', label: 'Transept', col: 8, row: 15, type: 'patrol_point' },
        // North arm of the transept.
        { id: '63_46_transept_north', label: 'North Transept', col: 6, row: 4, type: 'enemySpawn' },
        // Among the headstones north of the chancel.
        { id: '63_46_churchyard_east', label: 'East Churchyard', col: 17, row: 2, type: 'enemySpawn' },
        // At the door to the east breach: where the chapel-wing mission ends.
        { id: '63_46_exit_east', label: 'Exit: East', col: 20, row: 10, type: 'generic', tags: ['exit'] },
    ],
    network: {
        nodes: [
            { id: '63_46_crossing', position: { kind: 'gridPoint', col: 8, row: 10 }, tags: ['castle'] },
            { id: '63_46_center', position: { kind: 'gridPoint', col: 19, row: 18 }, tags: ['castle'] },
        ],
        edges: [
            ['62_46_nave', '63_46_crossing'],
            ['63_46_crossing', '63_46_center'],
            ['62_46_center', '63_46_center'],
        ],
    },
};
