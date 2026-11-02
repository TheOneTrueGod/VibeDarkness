/**
 * 62_48 Wizard's Study - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * South-west room of the arcane quarter: a scrying pool feeding a ley line, the desk, and shelves
 * along the walls. Door south to the east guardhouse.
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

export const SEGMENT_62_48_WIZARDS_STUDY: CastleSegment = {
    id: '62_48_wizards_study',
    gridCol: 62,
    gridRow: 48,
    description: 'The private study of the court wizard, with books, instruments and a workbench for magical research.',
    terrain: [
        [R, G, G, G, G, G, G, G, G, G, G, D, G, G, G, D, D, SW, D, D, _, _],
        [R, G, G, G, G, G, G, G, G, G, G, D, G, G, G, D, D, SW, D, D, _, _],
        [R, G, R, G, G, G, G, G, G, G, G, D, G, R, R, D, D, SW, D, D, D, D],
        [R, G, R, G, G, G, G, G, G, G, G, D, D, R, R, D, D, D, SW, D, D, D],
        [R, G, R, G, G, G, G, G, G, G, G, D, D, G, G, G, D, SW, D, SW, SW, SW],
        [R, G, R, G, G, G, G, G, G, G, G, G, D, D, G, G, SW, D, D, D, D, D],
        [R, G, R, G, G, G, G, G, G, G, G, G, G, D, G, SW, G, G, D, D, D, D],
        [R, G, R, G, G, G, G, G, G, G, G, G, G, D, SW, G, G, G, R, R, G, G],
        [R, G, R, G, G, G, G, G, G, G, G, G, G, SW, D, D, D, G, R, R, G, G],
        [R, G, G, G, G, G, G, G, G, G, G, G, SW, G, G, G, D, D, D, G, G, G],
        [R, G, G, G, G, G, G, G, G, G, G, SW, G, G, G, G, G, D, D, D, D, D],
        [R, G, G, G, G, G, G, G, G, G, SW, G, G, G, G, G, D, D, G, G, G, G],
        [R, G, G, G, G, G, SW, SW, SW, SW, G, G, G, G, G, D, D, G, G, G, G, G],
        [R, G, G, G, G, SW, SW, W, SW, SW, G, G, G, G, D, D, D, G, G, G, G, G],
        [R, G, G, G, G, SW, W, W, W, SW, G, G, G, G, D, D, G, G, G, G, G, G],
        [R, G, G, G, G, SW, SW, W, SW, SW, G, G, G, D, D, G, G, G, G, G, G, G],
        [R, G, G, G, G, G, SW, SW, SW, G, G, G, D, D, G, G, R, R, R, G, G, G],
        [R, G, G, G, G, G, G, G, G, G, G, D, D, D, G, G, R, R, R, G, G, G],
        [R, G, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G],
        [R, G, G, G, R, R, R, R, G, G, D, D, G, G, R, R, R, R, R, R, G, G],
        [R, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, G],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the loop path round the summoning circle.
        { id: '62_48_arcane_loop_sw', label: 'Arcane Loop (South-west)', col: 15, row: 8, type: 'patrol_point' },
        // Beside the west shelves.
        { id: '62_48_study_shelves', label: 'Study Shelves', col: 4, row: 4, type: 'enemySpawn' },
        // Behind the desk.
        { id: '62_48_study_desk', label: 'Study Desk', col: 17, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_48_center', position: { kind: 'gridPoint', col: 15, row: 8 }, tags: ['castle'] }],
        edges: [],
    },
};
