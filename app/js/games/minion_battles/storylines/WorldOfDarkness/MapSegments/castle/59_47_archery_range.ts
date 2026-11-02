/**
 * 59_47 Archery Range - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Five lanes split by 1-wide walls run west to hay-bale targets; the shooting line is the open
 * east strip. Long sight lines, little cover across them.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;

export const SEGMENT_59_47_ARCHERY_RANGE: CastleSegment = {
    id: '59_47_archery_range',
    gridCol: 59,
    gridRow: 47,
    description: 'Shooting lanes with targets at the far end. In many realms every able man was required by law to practise with the bow.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, R],
        [R, T, T, G, G, G, G, G, G, G, D, D, D, D, D, D, D, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, G, G, D, D, D, D, D, D, D, G, G, G, R],
        [R, G, G, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, D, G, G, R],
        [R, G, G, G, G, G, G, G, G, G, G, G, G, G, G, D, D, D, D, G, G, R],
        [R, T, T, G, G, G, G, G, G, G, G, G, G, G, G, G, D, D, D, G, G, R],
        [R, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, D, D, D, G, G, R],
        [R, G, G, R, R, R, R, R, R, R, R, R, R, R, R, G, D, D, D, G, G, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, T, T, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, G, G, R, R, R, R, R, R, R, R, R, R, R, R, G, D, D, D, G, D, R],
        [R, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, D, D, D, G, G, R],
        [R, T, T, G, G, G, G, G, G, G, G, G, G, G, G, G, D, D, D, G, G, R],
        [R, G, G, G, G, G, G, G, G, G, G, G, G, G, G, D, D, D, D, G, G, R],
        [R, G, G, R, R, R, R, R, R, R, R, R, R, R, R, D, D, D, D, G, G, R],
        [R, G, G, G, G, G, G, G, G, G, G, G, D, D, D, D, D, D, G, G, G, R],
        [R, T, T, G, G, G, G, G, G, G, G, D, D, D, D, D, D, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, D, D, G, G, G, G, G, G, G, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // On the shooting line.
        { id: '59_47_archery_line', label: 'Shooting Line', col: 17, row: 10, type: 'patrol_point' },
        // By the middle target.
        { id: '59_47_archery_targets', label: 'Targets', col: 2, row: 10, type: 'enemySpawn' },
        // By the south target.
        { id: '59_47_archery_targets_south', label: 'South Targets', col: 2, row: 18, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '59_47_center', position: { kind: 'gridPoint', col: 17, row: 10 }, tags: ['castle'] }],
        edges: [
            ['60_47_center', '59_47_center'],
            ['59_46_center', '59_47_center'],
            ['58_47_center', '59_47_center'],
        ],
    },
};
