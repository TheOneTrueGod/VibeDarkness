/**
 * 59_48 Smithy - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Forge with a quench pool, anvils and a weapon rack; a walled workshop in the south-east corner
 * that opens to the stables.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const SW = TerrainType.ShallowWater;
const W = TerrainType.Water;

export const SEGMENT_59_48_SMITHY: CastleSegment = {
    id: '59_48_smithy',
    gridCol: 59,
    gridRow: 48,
    description: "The blacksmith's forge, where weapons, armour, horseshoes and tools were made and repaired. A besieged castle could not hold out long without one.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, R, R, R, R, R, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, R, R, R, R, R, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, R, R, R, R, R, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, R, R, R, R, R, D, D, R, D, D, R, D, R, D, D, D, D, D, R],
        [R, D, SW, SW, SW, SW, SW, SW, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, SW, W, W, W, W, SW, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, SW, W, W, W, W, SW, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, SW, W, W, W, W, SW, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, SW, SW, SW, SW, SW, SW, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Middle of the smithy.
        { id: '59_48_smithy_floor', label: 'Smithy Floor', col: 10, row: 11, type: 'patrol_point' },
        // At the forge mouth.
        { id: '59_48_smithy_forge', label: 'Forge', col: 8, row: 5, type: 'generic' },
        // Inside the workshop.
        { id: '59_48_smithy_workshop', label: 'Workshop', col: 17, row: 17, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '59_48_center', position: { kind: 'gridPoint', col: 10, row: 11 }, tags: ['castle'] }],
        edges: [
            ['60_48_center', '59_48_center'],
            ['59_47_center', '59_48_center'],
        ],
    },
};
