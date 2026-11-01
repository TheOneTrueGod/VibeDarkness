/**
 * 63_42 Menagerie - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Four grass enclosures, each ringed by a water moat with a single 1-wide gate, around a cross of
 * paths.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const W = TerrainType.Water;

export const SEGMENT_63_42_MENAGERIE: CastleSegment = {
    id: '63_42_menagerie',
    gridCol: 63,
    gridRow: 42,
    description: 'A collection of exotic animals kept by the ruler to show off wealth and far-reaching connections, an early form of the zoo.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, W, W, W, W, W, W, W, D, D, D, D, D, D, W, W, W, W, W, W, W, R],
        [R, W, _, _, _, _, _, W, D, D, D, D, D, D, W, _, _, _, _, _, W, R],
        [R, W, _, _, _, _, _, W, D, D, D, D, D, D, W, _, _, _, _, _, W, R],
        [R, W, _, _, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _, _, W, R],
        [R, W, _, _, _, _, _, W, D, D, D, D, D, D, W, _, _, _, _, _, W, R],
        [R, W, _, _, _, _, _, W, D, D, D, D, D, D, W, _, _, _, _, _, W, R],
        [R, W, W, W, W, W, W, W, D, D, D, D, D, D, W, W, W, W, W, W, W, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, W, W, W, D, W, W, W, D, D, D, D, D, D, W, W, W, D, W, W, W, R],
        [R, W, _, _, _, _, _, W, D, D, D, D, D, D, W, _, _, _, _, _, W, R],
        [R, W, _, _, _, _, _, W, D, D, D, D, D, D, W, _, _, _, _, _, W, R],
        [R, W, _, _, _, _, _, W, D, D, D, D, D, D, W, _, _, _, _, _, W, R],
        [R, W, _, _, _, _, _, W, D, D, D, D, D, D, W, _, _, _, _, _, W, R],
        [R, W, _, _, _, _, _, W, D, D, D, D, D, D, W, _, _, _, _, _, W, R],
        [R, W, W, W, W, W, W, W, D, D, D, D, D, D, W, W, W, W, W, W, W, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Crossing of the paths.
        { id: '63_42_menagerie', label: 'Menagerie', col: 10, row: 10, type: 'patrol_point' },
        // North-west enclosure.
        { id: '63_42_menagerie_pen_west', label: 'West Enclosure', col: 4, row: 4, type: 'enemySpawn' },
        // South-east enclosure.
        { id: '63_42_menagerie_pen_east', label: 'East Enclosure', col: 17, row: 17, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '63_42_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['63_43_center', '63_42_center'],
        ],
    },
};
