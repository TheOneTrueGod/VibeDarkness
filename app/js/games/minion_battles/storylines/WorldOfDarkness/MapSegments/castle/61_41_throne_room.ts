/**
 * 61_41 Throne Room - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Boss arena. Two colonnades of 2x2 pillars, a grass carpet up to a raised dais and the throne.
 * 1-wide side doors to the war room and royal bedchamber; a secret 1-wide door behind the throne
 * leads to the royal vault.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const R = TerrainType.Rock;

export const SEGMENT_61_41_THRONE_ROOM: CastleSegment = {
    id: '61_41_throne_room',
    gridCol: 61,
    gridRow: 41,
    description: 'The formal hall where the ruler sat in state to receive envoys, hear petitions and pass judgement. The throne stands on a raised platform at the far end.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, _, _, _, _, _, _, _, _, _, _, D, D, D, D, D, R],
        [R, D, D, D, D, D, _, _, _, _, _, _, _, _, _, _, D, D, D, D, D, R],
        [R, D, D, D, D, D, _, _, _, _, R, R, _, _, _, _, D, D, D, D, D, R],
        [R, D, D, D, D, D, _, _, _, _, _, _, _, _, _, _, D, D, D, D, D, R],
        [R, D, D, R, R, D, _, _, _, _, _, _, _, _, _, _, D, R, R, D, D, R],
        [R, D, D, R, R, D, D, D, D, D, _, _, D, D, D, D, D, R, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, R, R, D, D, D, D, D, _, _, D, D, D, D, D, R, R, D, D, R],
        [R, D, D, R, R, D, D, D, D, D, _, _, D, D, D, D, D, R, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, R, R, D, D, D, D, D, _, _, D, D, D, D, D, R, R, D, D, D],
        [R, D, D, R, R, D, D, D, D, D, _, _, D, D, D, D, D, R, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // In front of the throne.
        { id: '61_41_throne', label: 'Throne', col: 10, row: 4, type: 'generic' },
        // On the carpet, mid-hall.
        { id: '61_41_throne_hall', label: 'Throne Hall', col: 10, row: 14, type: 'patrol_point' },
        // Dark-crystal light spot, west of the dais.
        { id: '61_41_throne_brazier_west', label: 'West Brazier', col: 7, row: 7, type: 'crystal', tags: ['dark'] },
        // Dark-crystal light spot, east of the dais.
        { id: '61_41_throne_brazier_east', label: 'East Brazier', col: 14, row: 7, type: 'crystal', tags: ['dark'] },
        // Behind the west colonnade.
        { id: '61_41_throne_colonnade_west', label: 'West Colonnade', col: 1, row: 8, type: 'enemySpawn' },
        // Behind the east colonnade.
        { id: '61_41_throne_colonnade_east', label: 'East Colonnade', col: 20, row: 8, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '61_41_center', position: { kind: 'gridPoint', col: 10, row: 12 }, tags: ['castle'] }],
        edges: [
            ['61_42_center', '61_41_center'],
        ],
    },
};
