/**
 * 64_43 Summoning Circle - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Ritual arena: a ring of eight pillars around a shallow-water ritual groove and a grass centre.
 * End of the upper east wing.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;

export const SEGMENT_64_43_SUMMONING_CIRCLE: CastleSegment = {
    id: '64_43_summoning_circle',
    gridCol: 64,
    gridRow: 43,
    description: 'A ritual chamber with a circle inscribed on the floor, where sorcerers called up spirits or creatures and bound them to service.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, R, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, SW, SW, SW, SW, SW, SW, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, SW, SW, D, D, D, D, D, D, SW, SW, D, D, D, D, D, R],
        [R, D, D, R, D, D, SW, D, D, D, D, D, D, D, D, SW, D, R, D, D, D, R],
        [R, D, D, D, D, SW, D, D, D, D, D, D, D, D, D, D, SW, D, D, D, D, R],
        [D, D, D, D, D, SW, D, D, D, D, _, _, D, D, D, D, SW, D, D, D, D, R],
        [D, D, D, D, D, SW, D, D, D, _, _, _, _, D, D, D, SW, D, D, D, D, D],
        [D, D, D, D, D, SW, D, D, D, _, _, _, _, D, D, D, SW, D, D, D, D, D],
        [R, D, D, D, D, SW, D, D, D, D, _, _, D, D, D, D, SW, D, D, D, D, R],
        [R, D, D, R, D, SW, D, D, D, D, D, D, D, D, D, D, SW, R, D, D, D, R],
        [R, D, D, D, D, D, SW, D, D, D, D, D, D, D, D, SW, D, D, D, D, D, R],
        [R, D, D, D, D, D, SW, SW, D, D, D, D, D, D, SW, SW, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, SW, SW, SW, SW, SW, SW, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, R, D, D, D, D, D, R, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Centre of the circle.
        { id: '64_43_summoning_circle', label: 'Summoning Circle', col: 10, row: 10, type: 'generic' },
        // North-west corner.
        { id: '64_43_summoning_northwest', label: 'Circle North-west', col: 3, row: 3, type: 'enemySpawn' },
        // South-east corner.
        { id: '64_43_summoning_southeast', label: 'Circle South-east', col: 18, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '64_43_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['63_43_center', '64_43_center'],
            ['64_44_center', '64_43_center'],
        ],
    },
};
