/**
 * 63_40 Observatory - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Round observatory room inside the north wall with the telescope mount in the middle; joins the
 * royal baths to the north wall walk.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_63_40_OBSERVATORY: CastleSegment = {
    id: '63_40_observatory',
    gridCol: 63,
    gridRow: 40,
    description: 'A tower room for watching the stars, used by court astrologers to draw up horoscopes and calendars.',
    terrain: [
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
        [SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW, SW],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, D, D, D, D, D, D, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [D, D, D, D, D, D, D, D, D, D, R, R, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, R, R, D, D, D, D, D, D, D, D, D, D],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, D, D, D, D, D, D, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // North of the telescope mount.
        { id: '63_40_observatory_telescope', label: 'Telescope', col: 10, row: 14, type: 'generic' },
        // South of the telescope mount.
        { id: '63_40_observatory', label: 'Observatory', col: 10, row: 19, type: 'patrol_point' },
    ],
    network: {
        nodes: [{ id: '63_40_center', position: { kind: 'gridPoint', col: 10, row: 19 }, tags: ['castle'] }],
        edges: [
            ['63_41_center', '63_40_center'],
            ['64_40_center', '63_40_center'],
        ],
    },
};
