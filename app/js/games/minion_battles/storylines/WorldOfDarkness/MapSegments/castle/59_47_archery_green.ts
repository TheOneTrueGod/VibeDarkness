/**
 * 59_47 Archery Green - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * North-west quarter of the training ring (59-60 x 47-48, painted as one outdoor space reached
 * only through the courtyard's west door): four targets (rock posts on gravel butts) along the
 * west wall, the shooting line on the main north-south path, and a dirt clearing at the south end
 * with two campfire spots side by side. No doors of its own.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const _ = TerrainType.Grass;
const B = TerrainType.Brick;
const D = TerrainType.Dirt;
const G = TerrainType.Gravel;
const R = TerrainType.Rock;
const T = TerrainType.ThickGrass;

export const SEGMENT_59_47_ARCHERY_GREEN: CastleSegment = {
    id: '59_47_archery_green',
    gridCol: 59,
    gridRow: 47,
    description: 'An open green for archery practice, with targets on earthen butts. In many realms every able man was required by law to practise with the bow.',
    terrain: [
        [B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B, B],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, G, G, G, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, G, G, R, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, T, T, T],
        [B, G, G, G, _, _, _, _, _, _, _, _, _, _, D, D, _, _, T, T, T, T],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, _, T, T, T, T],
        [B, G, G, G, _, _, _, _, _, _, _, _, _, _, D, D, _, _, T, T, T, T],
        [B, G, G, R, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, T, T, T],
        [B, G, G, G, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, G, G, G, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, G, G, R, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, G, G, G, _, _, _, _, _, _, _, _, _, _, D, D, D, D, D, D, D, D],
        [B, _, _, _, _, _, _, _, _, _, _, _, _, _, D, D, D, D, D, D, D, D],
        [B, G, G, G, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, G, G, R, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, G, G, G, _, _, _, _, _, _, _, _, _, _, D, D, _, _, _, _, _, _],
        [B, _, _, _, _, _, _, _, D, D, D, D, D, D, D, D, _, _, _, _, _, _],
        [B, _, _, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, _],
        [B, _, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _, _],
        [B, _, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D, D, D, _, _, _],
        [B, _, _, _, _, _, D, D, D, D, D, D, D, D, D, D, D, D, _, _, _, _],
    ],
    pointsOfInterest: [
        // On the shooting line.
        { id: '59_47_shooting_line', label: 'Shooting Line', col: 14, row: 9, type: 'patrol_point' },
        // Between the targets at the west wall.
        { id: '59_47_targets', label: 'Targets', col: 3, row: 9, type: 'enemySpawn' },
        // In the thicket on the east side.
        { id: '59_47_thicket', label: 'Thicket', col: 20, row: 5, type: 'enemySpawn' },
        // West campfire spot in the south clearing.
        { id: '59_47_campfire_west', label: 'Campfire (West)', col: 8, row: 19, type: 'campfire' },
        // East campfire spot in the south clearing.
        { id: '59_47_campfire_east', label: 'Campfire (East)', col: 12, row: 19, type: 'campfire' },
        // Between the two campfire spots: where the kennels-and-range mission ends.
        { id: '59_47_exit_campfires', label: 'Exit: Campfires', col: 10, row: 18, type: 'generic', tags: ['exit'] },
    ],
    network: {
        nodes: [{ id: '59_47_center', position: { kind: 'gridPoint', col: 14, row: 9 }, tags: ['castle'] }],
        edges: [
            ['59_47_center', '60_47_center'],
            ['59_47_center', '59_48_center'],
        ],
    },
};
