/**
 * 63_44 Library Rotunda - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Round reading room: eight radial bookshelves around a central desk. Sight lines open and close
 * as you circle it.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_63_44_LIBRARY_ROTUNDA: CastleSegment = {
    id: '63_44_library_rotunda',
    gridCol: 63,
    gridRow: 44,
    description: 'A round reading room at the heart of the library, with shelves around the walls and reading desks in the middle.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, R, R, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, D, D, D, R, R, R, R, R, R, R, R, D, D, D, R, R, R, R],
        [R, R, R, D, D, D, R, R, R, R, R, R, R, R, R, R, D, D, D, R, R, R],
        [R, R, D, D, D, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, R, R],
        [R, R, D, D, R, R, R, R, R, D, D, D, D, R, R, R, R, R, D, D, R, R],
        [R, R, D, D, R, R, R, R, D, D, D, D, D, D, R, R, R, R, D, D, R, R],
        [R, D, D, D, R, R, R, D, D, D, R, R, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, R, R, R, R, D, D, R, R, R, R, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, R, R, R, R, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, R, R, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, R, R, D, D, R, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R],
        [R, D, D, D, D, D, D, D, R, R, D, D, R, R, D, D, D, D, D, D, R, R],
        [R, R, R, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, R, R, R],
        [R, R, R, R, D, D, D, D, R, D, D, D, D, R, D, D, D, D, R, R, R, R],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [R, R, R, R, R, R, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // North of the central desk.
        { id: '63_44_library_rotunda_desk', label: 'Rotunda Desk', col: 10, row: 7, type: 'generic' },
        // South of the central desk.
        { id: '63_44_library_rotunda', label: 'Library Rotunda', col: 10, row: 14, type: 'patrol_point' },
        // Between the eastern shelves.
        { id: '63_44_library_rotunda_east', label: 'Rotunda East', col: 16, row: 10, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '63_44_center', position: { kind: 'gridPoint', col: 10, row: 14 }, tags: ['castle'] }],
        edges: [],
    },
};
