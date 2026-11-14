/**
 * 60_45 Privy Chamber - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Private audience room: a long council table on a rug, a hearth, and a small oratory
 * (north-west, 1-wide door). South-east room of the royal chambers: 2-wide doors north to the
 * royal solar and west to the royal baths; no door down to the barracks.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;

export const SEGMENT_60_45_PRIVY_CHAMBER: CastleSegment = {
    id: '60_45_privy_chamber',
    gridCol: 60,
    gridRow: 45,
    description: "The ruler's private audience room, where only trusted advisers were let in to talk business in confidence, with a small oratory for private prayer.",
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, D, D, B, B, B, B, B, B, B, B, B, B],
        [B, G, G, G, G, G, B, G, G, G, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, B, G, G, G, G, B, G, G, G, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, B, G, G, G, D, D, _, _, _, _, _, _, G, G, G, B],
        [B, B, B, B, B, B, B, G, G, G, D, D, _, _, _, _, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, B, B, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, B, B, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, B, B, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, B, B, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, B, B, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, B, B, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, B, B, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, B, B, _, _, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, D, D, _, _, _, _, _, _, G, G, G, B],
        [D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, _, _, _, G, G, G, B],
        [D, D, D, D, D, D, D, D, D, D, D, D, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, B],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, B, B],
        [B, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, G, B, B],
        [B, G, G, B, G, G, G, B, G, G, G, G, G, G, G, B, G, G, G, G, G, B],
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
    ],
    pointsOfInterest: [
        // Beside the council table.
        { id: '60_45_council_table', label: 'Council Table', col: 13, row: 9, type: 'generic' },
        // Where the routes from the solar and the baths meet.
        { id: '60_45_privy_chamber', label: 'Privy Chamber', col: 10, row: 15, type: 'patrol_point' },
        // In the oratory.
        { id: '60_45_oratory', label: 'Oratory', col: 3, row: 3, type: 'enemySpawn' },
        // By the hearth in the south-east corner.
        { id: '60_45_hearth_corner', label: 'Hearth Corner', col: 18, row: 19, type: 'enemySpawn' },
        // Just inside the door west from the royal baths.
        { id: '60_45_entry_west', label: 'Entry: West', col: 1, row: 15, type: 'generic', tags: ['entry'] },
    ],
    network: {
        nodes: [{ id: '60_45_center', position: { kind: 'gridPoint', col: 10, row: 15 }, tags: ['castle'] }],
        edges: [
            ['60_44_center', '60_45_center'],
            ['59_45_center', '60_45_center'],
        ],
    },
};
