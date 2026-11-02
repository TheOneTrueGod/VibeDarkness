/**
 * 62_43 Observatory - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Round observatory room inside the north wall with the telescope mount in the middle; joins the
 * north wall walk to the garden.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_62_43_OBSERVATORY: CastleSegment = {
    id: '62_43_observatory',
    gridCol: 62,
    gridRow: 43,
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
        [R, R, R, R, R, R, R, R, G, G, G, G, G, G, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, G, G, G, G, G, G, G, G, G, G, R, R, R, R, R, R],
        [R, R, R, R, R, G, G, G, G, G, G, G, G, G, G, G, G, R, R, R, R, R],
        [R, G, G, G, G, G, G, G, G, G, R, R, G, G, G, D, D, D, D, D, D, D],
        [R, G, G, G, G, G, G, G, G, G, R, R, G, G, D, D, D, D, D, D, D, D],
        [R, R, R, R, R, G, G, G, G, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, R, G, G, G, D, D, D, D, D, D, D, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, G, D, D, D, D, D, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // North of the telescope mount.
        { id: '62_43_observatory_telescope', label: 'Telescope', col: 10, row: 14, type: 'generic' },
        // South of the telescope mount.
        { id: '62_43_observatory', label: 'Observatory', col: 10, row: 19, type: 'patrol_point' },
    ],
    network: {
        nodes: [{ id: '62_43_center', position: { kind: 'gridPoint', col: 10, row: 19 }, tags: ['castle'] }],
        edges: [
            ['63_43_center', '62_43_center'],
        ],
    },
};
