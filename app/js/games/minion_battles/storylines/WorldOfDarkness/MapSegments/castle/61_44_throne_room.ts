/**
 * 61_44 Throne Room - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Boss arena. Two colonnades of 2x2 pillars, a grass carpet up to a raised dais and the throne.
 * 1-wide side doors to the royal guard hall and the garden; a secret 1-wide door behind the throne
 * leads to the royal treasury.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;

export const SEGMENT_61_44_THRONE_ROOM: CastleSegment = {
    id: '61_44_throne_room',
    gridCol: 61,
    gridRow: 44,
    description: 'The formal hall where the ruler sat in state to receive envoys, hear petitions and pass judgement. The throne stands on a raised platform at the far end.',
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, R, R, R, R, R, R, R, R, R, R, R],
        [R, G, G, G, G, G, _, _, _, _, _, _, _, _, _, _, G, G, G, G, G, R],
        [R, G, G, G, G, G, _, _, _, _, _, _, _, _, _, _, G, G, G, G, G, R],
        [R, G, G, G, G, G, _, _, _, _, R, R, _, _, _, _, G, G, G, G, G, R],
        [R, G, G, G, G, G, _, _, _, _, _, _, _, _, _, _, G, G, G, G, G, R],
        [R, G, G, R, R, G, _, _, _, _, _, _, _, _, _, _, G, R, R, G, G, R],
        [R, G, G, R, R, G, G, D, D, D, _, _, D, G, G, G, G, R, R, G, G, R],
        [R, G, G, G, G, G, G, G, D, D, _, _, D, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, D, D, _, _, D, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, D, D, _, _, D, G, G, G, G, G, G, G, G, R],
        [R, G, D, R, R, D, D, D, D, D, _, _, D, D, D, D, D, R, R, D, G, R],
        [R, D, D, R, R, D, D, D, D, D, _, _, D, D, D, D, D, R, R, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, _, _, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, R, R, D, G, G, D, D, _, _, D, G, G, G, D, R, R, D, D, D],
        [R, D, D, R, R, G, G, G, D, D, _, _, D, G, G, G, G, R, R, D, D, R],
        [R, D, D, D, G, G, G, G, D, D, _, _, D, G, G, G, G, G, D, D, D, R],
        [R, G, G, G, G, G, G, G, D, D, _, _, D, G, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, D, D, _, _, D, D, G, G, G, G, G, G, G, R],
        [R, G, G, G, G, G, G, G, D, D, _, _, D, D, G, G, G, G, G, G, G, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // In front of the throne.
        { id: '61_44_throne', label: 'Throne', col: 10, row: 4, type: 'generic' },
        // On the carpet, mid-hall.
        { id: '61_44_throne_hall', label: 'Throne Hall', col: 10, row: 14, type: 'patrol_point' },
        // Dark-crystal light spot, west of the dais.
        { id: '61_44_throne_brazier_west', label: 'West Brazier', col: 7, row: 7, type: 'crystal', tags: ['dark'] },
        // Dark-crystal light spot, east of the dais.
        { id: '61_44_throne_brazier_east', label: 'East Brazier', col: 14, row: 7, type: 'crystal', tags: ['dark'] },
        // Behind the west colonnade.
        { id: '61_44_throne_colonnade_west', label: 'West Colonnade', col: 1, row: 8, type: 'enemySpawn' },
        // Behind the east colonnade.
        { id: '61_44_throne_colonnade_east', label: 'East Colonnade', col: 20, row: 8, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '61_44_center', position: { kind: 'gridPoint', col: 10, row: 12 }, tags: ['castle'] }],
        edges: [
            ['61_45_center', '61_44_center'],
        ],
    },
};
