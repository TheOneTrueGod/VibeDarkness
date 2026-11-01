/**
 * 63_43 Arcane Conduit - part of the castle around the 61_49 gate (see castle/index.ts for the plan).
 *
 * Upper east wing hall cut by two 2-wide water channels with a bridge over each. Ledges behind the
 * channels are perches for ranged units.
 * No light spots unless listed in the POIs: the castle is meant to be dark.
 * Generated with terrain/mapTools-style painting on one castle-wide canvas, so seams always line up.
 */

import { TerrainType } from '../../../../terrain/TerrainType';
import type { CastleSegment } from './castleSegment';

const D = TerrainType.Dirt;
const R = TerrainType.Rock;
const W = TerrainType.Water;

export const SEGMENT_63_43_ARCANE_CONDUIT: CastleSegment = {
    id: '63_43_arcane_conduit',
    gridCol: 63,
    gridRow: 43,
    description: "A hall built to carry magical power along carved water channels, feeding the castle's wards and the rituals in the summoning circle beyond.",
    terrain: [
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, R, R, R, R, R, R, R, R, R, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, W, W, W, W, W, W, W, W, W, D, D, W, W, W, W, W, W, W, W, W, R],
        [R, W, W, W, W, W, W, W, W, W, D, D, W, W, W, W, W, W, W, W, W, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [D, D, D, D, D, R, D, D, D, D, D, D, D, D, D, D, R, D, D, D, D, D],
        [D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, W, W, W, W, W, W, W, W, W, D, D, D, W, W, W, W, W, W, W, W, R],
        [R, W, W, W, W, W, W, W, W, W, D, D, D, W, W, W, W, W, W, W, W, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, D, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, D, R, R, R, R, R, R, R, R, R],
        [R, R, R, R, R, R, R, R, R, R, D, D, D, R, R, R, R, R, R, R, R, R],
    ],
    pointsOfInterest: [
        // Between the channels.
        { id: '63_43_arcane_conduit', label: 'Arcane Conduit', col: 7, row: 10, type: 'patrol_point' },
        // Ledge north of the channel.
        { id: '63_43_conduit_north_ledge', label: 'North Ledge', col: 4, row: 3, type: 'enemySpawn' },
        // Ledge south of the channel.
        { id: '63_43_conduit_south_ledge', label: 'South Ledge', col: 17, row: 17, type: 'enemySpawn' },
    ],
    network: {
        nodes: [{ id: '63_43_center', position: { kind: 'gridPoint', col: 7, row: 10 }, tags: ['castle'] }],
        edges: [
            ['62_43_center', '63_43_center'],
            ['63_44_center', '63_43_center'],
        ],
    },
};
