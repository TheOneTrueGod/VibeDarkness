/**
 * 59_43 Arena Gate - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Upper west wing corridor with four side rooms; a wide ready room opens south through a 3-wide
 * gate into the gladiator pit.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_59_43_ARENA_GATE: CastleSegment = {
    id: '59_43_arena_gate',
    gridCol: 59,
    gridRow: 43,
    description: 'The holding area behind the gladiator pit, where fighters and beasts waited before being sent into the ring.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, R, R],
        [R, R, R, R, R, D, R, R, R, D, D, D, D, R, R, R, D, R, R, R, R, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, R, R, R, D, R, R, R, D, D, D, D, D, D, R, R, R, D, R, R, R, R],
        [R, R, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, R, R],
        [R, R, D, D, D, D, D, R, D, D, D, D, D, D, R, D, D, D, D, D, R, R],
        [R, R, R, R, R, R, R, R, D, D, D, D, D, D, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Ready room above the pit gate.
        { id: '59_43_arena_ready_room', label: 'Ready Room', col: 10, row: 18, type: 'generic' },
        // Corridor centre.
        { id: '59_43_arena_gate_corridor', label: 'Arena Gate Corridor', col: 10, row: 10, type: 'patrol_point' },
        // North-west side room.
        { id: '59_43_arena_gate_northwest', label: 'North-west Room', col: 4, row: 4, type: 'enemySpawn' },
        // South-east side room.
        { id: '59_43_arena_gate_southeast', label: 'South-east Room', col: 17, row: 16, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '59_43_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['60_43_center', '59_43_center'],
            ['59_44_center', '59_43_center'],
        ],
    },
};
