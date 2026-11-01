/**
 * 57_43 West Bastion - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A round bastion projecting from the west curtain wall into the moat, with a fighting room. End
 * of the upper west wing.
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

export const SEGMENT_57_43_WEST_BASTION: CastleSegment = {
    id: '57_43_west_bastion',
    gridCol: 57,
    gridRow: 43,
    description: 'A bastion is a platform jutting out from the curtain wall. It let defenders fire along the wall in both directions and gave room for heavier weapons.',
    terrain: [
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, SW, SW, W, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, SW, SW, W, W, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, SW, W, W, W, R, R, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, SW, W, W, W, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [_, _, SW, SW, W, W, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [_, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [_, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [_, _, SW, SW, W, W, R, R, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [_, _, _, SW, W, W, R, R, R, D, D, D, D, D, D, D, D, R, R, R, R, R],
        [_, _, _, SW, W, W, W, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, SW, W, W, W, R, R, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, SW, SW, W, W, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, SW, SW, W, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, D, D, D, D, R, R, R, R, R],
        [_, _, _, _, _, _, _, SW, W, W, R, R, R, R, R, D, D, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Centre of the bastion room.
        { id: '57_43_west_bastion_room', label: 'West Bastion Room', col: 10, row: 10, type: 'generic' },
        // On the wall walk.
        { id: '57_43_west_bastion_walk', label: 'West Bastion Walk', col: 15, row: 15, type: 'patrol_point' },
    ],
    network: {
        nodes: [{ id: '57_43_center', position: { kind: 'gridPoint', col: 15, row: 15 }, tags: ['castle'] }],
        edges: [
            ['58_43_center', '57_43_center'],
            ['57_42_center', '57_43_center'],
        ],
    },
};
