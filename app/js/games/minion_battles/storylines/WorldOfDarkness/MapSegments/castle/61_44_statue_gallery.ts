/**
 * 61_44 Statue Gallery - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * An 8-wide walkway with statues, walled off from two side galleries that open onto it through
 * three 2-wide arches each: ambush flanks.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_61_44_STATUE_GALLERY: CastleSegment = {
    id: '61_44_statue_gallery',
    gridCol: 61,
    gridRow: 44,
    description: "A long hall displaying statues of past rulers and heroes. Visitors on their way to the throne passed through it, as a reminder of the family's lineage and power.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, R, D, D, D, D, R, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, R, D, D, D, D, R, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, R, D, D, R, D, D, D, D, D, D, D, D, R, D, D, R, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, R, D, D, D, D, R, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, D, D, D, D, D, R, D, D, D, D, D, D, D, D, R, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, D, D, D, D, D, D, D, D, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, D, D, D, D, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Middle of the statue walkway.
        { id: '61_44_gallery_walk', label: 'Gallery Walk', col: 10, row: 12, type: 'patrol_point' },
        // Side gallery, out of sight of the walkway.
        { id: '61_44_gallery_west', label: 'West Gallery', col: 2, row: 10, type: 'enemySpawn' },
        // Side gallery, out of sight of the walkway.
        { id: '61_44_gallery_east', label: 'East Gallery', col: 19, row: 10, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '61_44_center', position: { kind: 'gridPoint', col: 10, row: 11 }, tags: ['castle'] }],
        edges: [
            ['61_45_center', '61_44_center'],
        ],
    },
};
