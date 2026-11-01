/**
 * 59_45 Archery Range - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Five lanes split by 1-wide walls run west to hay-bale targets; the shooting line is the open
 * east strip. Long sight lines, little cover across them.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;

export const SEGMENT_59_45_ARCHERY_RANGE: CastleSegment = {
    id: '59_45_archery_range',
    gridCol: 59,
    gridRow: 45,
    description: 'Shooting lanes with targets at the far end. In many realms every able man was required by law to practise with the bow.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the shooting line.
        { id: '59_45_archery_line', label: 'Shooting Line', col: 17, row: 10, type: 'patrol_point' },
        // By the middle target.
        { id: '59_45_archery_targets', label: 'Targets', col: 2, row: 10, type: 'enemySpawn' },
        // By the south target.
        { id: '59_45_archery_targets_south', label: 'South Targets', col: 2, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '59_45_center', position: { kind: 'gridPoint', col: 17, row: 10 }, tags: ['castle'] }],
        edges: [
            ['60_45_center', '59_45_center'],
            ['59_44_center', '59_45_center'],
        ],
    },
};
