/**
 * 60_44 Royal Guard Hall - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Long hall with a double colonnade beside the throne room; joins the north stair tower, the
 * throne room, the royal bedchamber and the war room.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;

export const SEGMENT_60_44_ROYAL_GUARD_HALL: CastleSegment = {
    id: '60_44_royal_guard_hall',
    gridCol: 60,
    gridRow: 44,
    description: "The post and quarters of the ruler's personal guard, kept within a few steps of the throne room.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, R, R, G, G, D, D, D, G, G, G, R, R, G, G, G, G, R],
        [R, G, G, G, G, R, R, G, G, D, D, D, G, G, G, R, R, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, R, R, G, G, D, D, D, G, G, G, R, R, G, G, G, G, R],
        [R, G, G, G, G, R, R, G, G, D, D, D, G, G, G, R, R, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, G, G, G, G, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, G, G, G, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, G, G, R],
        [R, D, G, G, G, G, G, G, G, D, D, D, G, G, G, D, D, D, D, D, G, R],
        [R, G, G, G, G, R, R, G, G, D, D, D, G, G, G, R, R, D, D, D, D, R],
        [R, G, G, G, G, R, R, G, G, D, D, D, G, G, G, R, R, D, D, D, D, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, D, D, D, D],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, D, D, R],
        [R, G, G, G, G, R, R, G, G, D, D, D, G, G, G, R, R, G, G, G, G, R],
        [R, G, G, G, G, R, R, G, G, D, D, D, G, G, G, R, R, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, G, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, G, D, D, D, D, G, G, G, G, G, G, G, G, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Hall centre.
        { id: '60_44_royal_guard_hall', label: 'Royal Guard Hall', col: 10, row: 10, type: 'patrol_point' },
        // Behind the west colonnade.
        { id: '60_44_royal_guard_west', label: 'West Colonnade', col: 2, row: 4, type: 'enemySpawn' },
        // Behind the east colonnade.
        { id: '60_44_royal_guard_east', label: 'East Colonnade', col: 19, row: 16, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '60_44_center', position: { kind: 'gridPoint', col: 10, row: 10 }, tags: ['castle'] }],
        edges: [
            ['61_44_center', '60_44_center'],
            ['60_43_center', '60_44_center'],
        ],
    },
};
