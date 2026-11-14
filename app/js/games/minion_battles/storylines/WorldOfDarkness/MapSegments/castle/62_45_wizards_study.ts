/**
 * 62_45 Wizard's Study - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * South-west room of the wizard's tower: a scrying pool feeding a ley line, the desk, and shelves
 * along the walls. No outside doors.
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
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_62_45_WIZARDS_STUDY: CastleSegment = {
    id: '62_45_wizards_study',
    gridCol: 62,
    gridRow: 45,
    description: 'The private study of the court wizard, with books, instruments and a workbench for magical research.',
    terrain: [
        [B, G, G, G, G, G, G, G, G, G, G, D, G, G, G, D, D, SW, D, D, _, _],
        [B, G, G, G, G, G, G, G, G, G, G, D, G, G, G, D, D, SW, D, D, _, _],
        [B, G, B, G, G, G, G, G, G, G, G, D, G, R, R, D, D, SW, D, D, D, D],
        [B, G, B, G, G, G, G, G, G, G, G, D, D, R, R, D, D, D, SW, D, D, D],
        [B, G, B, G, G, G, G, G, G, G, G, D, D, G, G, G, D, SW, D, SW, SW, SW],
        [B, G, B, G, G, G, G, G, G, G, G, G, D, D, G, G, SW, D, D, D, D, D],
        [B, G, B, G, G, G, G, G, G, G, G, G, G, D, G, SW, G, G, D, D, D, D],
        [B, G, B, G, G, G, G, G, G, G, G, G, G, D, SW, G, G, G, R, R, G, G],
        [B, G, B, G, G, G, G, G, G, G, G, G, G, SW, D, D, D, G, R, R, G, G],
        [B, G, G, G, G, G, G, G, G, G, G, G, SW, G, G, G, D, D, D, G, G, G],
        [B, G, G, G, G, G, G, G, G, G, G, SW, G, G, G, G, G, D, D, D, D, D],
        [B, G, G, G, G, G, G, G, G, G, SW, G, G, G, G, G, D, D, G, G, G, G],
        [B, G, G, G, G, G, SW, SW, SW, SW, G, G, G, G, G, D, D, G, G, G, G, G],
        [B, G, G, G, G, SW, SW, W, SW, SW, G, G, G, G, D, D, D, G, G, G, G, G],
        [B, G, G, G, G, SW, W, W, W, SW, G, G, G, G, D, D, G, G, G, G, G, G],
        [B, G, G, G, G, SW, SW, W, SW, SW, G, G, G, D, D, G, G, G, G, G, G, G],
        [B, G, G, G, G, G, SW, SW, SW, G, G, G, D, D, G, G, B, B, B, G, G, G],
        [B, G, G, G, G, G, G, G, G, G, G, D, D, D, G, G, B, B, B, G, G, G],
        [B, G, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G],
        [B, G, G, G, B, B, B, B, G, G, D, D, G, G, B, B, B, B, B, B, G, G],
        [B, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, G],
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // On the loop path round the summoning circle.
        { id: '62_45_arcane_loop_sw', label: 'Arcane Loop (South-west)', col: 15, row: 8, type: 'patrol_point' },
        // Beside the west shelves.
        { id: '62_45_study_shelves', label: 'Study Shelves', col: 4, row: 4, type: 'enemySpawn' },
        // Behind the desk.
        { id: '62_45_study_desk', label: 'Study Desk', col: 17, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '62_45_center', position: { kind: 'gridPoint', col: 15, row: 8 }, tags: ['castle'] }],
        edges: [
            ['62_45_center', '63_45_center'],
        ],
    },
};
