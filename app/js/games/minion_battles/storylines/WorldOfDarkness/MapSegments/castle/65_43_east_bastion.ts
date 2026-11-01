/**
 * 65_43 East Bastion - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * A round bastion projecting from the east curtain wall into the moat (mirror of the west
 * bastion).
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

export const SEGMENT_65_43_EAST_BASTION: CastleSegment = {
    id: '65_43_east_bastion',
    gridCol: 65,
    gridRow: 43,
    description: 'A bastion is a platform jutting out from the curtain wall. It let defenders fire along the wall in both directions and gave room for heavier weapons.',
    terrain: [
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, W, SW, SW, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, W, W, SW, SW, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, R, R, W, W, W, SW, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, W, W, W, SW, _, _, _],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, R, R, R, W, W, SW, _, _, _],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, W, W, SW, SW, _, _],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, W, W, SW, _, _],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, R, W, W, SW, _, _],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, R, R, W, W, SW, SW, _, _],
        [R, R, R, R, R, D, D, D, D, D, D, D, D, R, R, R, W, W, SW, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, W, W, W, SW, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, R, R, W, W, W, SW, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, W, W, SW, SW, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, W, SW, SW, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, D, D, R, R, R, W, W, SW, _, _, _, _, _, _, _],
        [R, R, R, R, R, D, D, R, R, R, R, R, W, W, SW, _, _, _, _, _, _, _],
    ],
    pointsOfInterest: [
        // Centre of the bastion room.
        { id: '65_43_east_bastion_room', label: 'East Bastion Room', col: 11, row: 10, type: 'generic' },
        // On the wall walk.
        { id: '65_43_east_bastion_walk', label: 'East Bastion Walk', col: 6, row: 15, type: 'patrol_point' },
    ],
    network: {
        nodes: [{ id: '65_43_center', position: { kind: 'gridPoint', col: 6, row: 15 }, tags: ['castle'] }],
        edges: [
            ['64_43_center', '65_43_center'],
            ['65_42_center', '65_43_center'],
        ],
    },
};
