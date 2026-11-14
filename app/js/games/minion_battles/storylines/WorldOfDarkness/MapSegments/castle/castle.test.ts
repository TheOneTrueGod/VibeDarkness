import { describe, it, expect } from 'vitest';
import { TerrainType } from '../../../../terrain/TerrainType';
import {
    checkSeam,
    findNarrowGaps,
    findPath,
    isPassable,
    paintCells,
    rectCells,
    segmentAddress,
    segmentBlockCell,
    stitchSegmentBlock,
    type GridCell,
} from '../../../../terrain/mapTools';
import { MAP_SEGMENT_61_49_CASTLE_GATE } from '../61_49_castle_gate';
import {
    CASTLE_COURTYARD_NETWORK,
    COURTYARD_EAST_DOOR,
    COURTYARD_ENTRY_SOUTH,
    COURTYARD_WEST_DOOR,
    MAP_SEGMENT_61_48_CASTLE_COURTYARD,
} from '../61_48_castle_courtyard';
import { MAP_SEGMENT_60_50_CAVE_ROAD } from '../60_50_cave_road';
import { CASTLE_SEGMENTS } from './index';

const SIZE = 22;
const COL0 = 58;
const ROW0 = 43;
const COLS = 7;
const ROWS = 7;

const byAddress = new Map<string, TerrainType[][]>([
    ['61_49', MAP_SEGMENT_61_49_CASTLE_GATE],
    ['61_48', MAP_SEGMENT_61_48_CASTLE_COURTYARD],
]);
for (const s of CASTLE_SEGMENTS) byAddress.set(segmentAddress(s.gridCol, s.gridRow), s.terrain);

const BLOCK = { col0: COL0, row0: ROW0 };

/** Whole castle as one grid, segments placed by world-grid address. */
function stitchCastle(): TerrainType[][] {
    return stitchSegmentBlock(byAddress, COL0, ROW0, COLS, ROWS);
}

/** 4-connected flood fill over passable cells. */
function floodFrom(grid: TerrainType[][], col: number, row: number): boolean[][] {
    const seen = grid.map((r) => r.map(() => false));
    const stack: [number, number][] = [[col, row]];
    seen[row][col] = true;
    while (stack.length > 0) {
        const [c, r] = stack.pop()!;
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nc = c + dc;
            const nr = r + dr;
            if (nr < 0 || nc < 0 || nr >= grid.length || nc >= grid[0].length) continue;
            if (seen[nr][nc] || !isPassable(grid[nr][nc])) continue;
            seen[nr][nc] = true;
            stack.push([nc, nr]);
        }
    }
    return seen;
}

/** Canvas cells of a segment-local rectangle (inclusive corners). */
function segmentRect(col: number, row: number, a: GridCell, b: GridCell): GridCell[] {
    return rectCells(a, b).map((cell) => segmentBlockCell(BLOCK, SIZE, col, row, cell));
}

/** Gate approach cell on the stitched castle. */
const GATE = segmentBlockCell(BLOCK, SIZE, 61, 49, { col: 10, row: 17 });

/** Every canvas cell of the given segments. */
function segmentCells(addresses: [number, number][]): GridCell[] {
    return addresses.flatMap(([col, row]) => segmentRect(col, row, { col: 0, row: 0 }, { col: SIZE - 1, row: SIZE - 1 }));
}

/** How many of `cells` (minus `except`) are passable and reached by a walk from the gate. */
function reachedIn(grid: TerrainType[][], cells: GridCell[], except: GridCell[] = []): number {
    const reached = floodFrom(grid, GATE.col, GATE.row);
    const skip = new Set(except.map((c) => `${c.col},${c.row}`));
    const counts = (c: GridCell) => !skip.has(`${c.col},${c.row}`) && isPassable(grid[c.row][c.col]) && reached[c.row][c.col];
    return cells.filter(counts).length;
}

const TRAINING_RING = segmentCells([[59, 47], [60, 47], [59, 48], [60, 48]]);
/** The walled barracks lane along 60_47's north edge (crossroads -> barracks), not part of the ring. */
const BARRACKS_LANE = segmentRect(60, 47, { col: 8, row: 0 }, { col: 21, row: 4 });
const GARDEN = segmentCells([[62, 47], [63, 47], [62, 48], [63, 48]]);
/** The courtyard's 4-wide doors (rows 13-16): west into the training ring, east into the garden. */
const COURTYARD_WEST_DOORWAY = segmentRect(61, 48, { col: 0, row: 13 }, { col: 1, row: 16 });
const COURTYARD_EAST_DOORWAY = segmentRect(61, 48, { col: 20, row: 13 }, { col: 21, row: 16 });
/** The throne room and the treasury behind it (reached only through the throne room's secret door). */
const THRONE_ROOM = [
    ...segmentCells([[61, 44]]),
    // Treasury rooms inside the north wall (rows 0-11 of row 43 are outside the moat).
    ...segmentRect(61, 43, { col: 0, row: 12 }, { col: SIZE - 1, row: SIZE - 1 }),
];
/** The bridge's north door into the throne room. */
const THRONE_DOOR = segmentRect(61, 44, { col: 10, row: 21 }, { col: 11, row: 21 });
const ROYAL_CHAMBERS = segmentCells([[59, 44], [60, 44], [59, 45], [60, 45]]);
/** The west wall walk's one 2-wide door into the royal chambers (58_44 guard room -> master bedroom). */
const ROYAL_CHAMBER_DOORS = segmentRect(58, 44, { col: 21, row: 10 }, { col: 21, row: 11 });
const WIZARDS_TOWER = segmentCells([[62, 44], [63, 44], [62, 45], [63, 45]]);
/** The east wall walk's one 2-wide door into the tower (64_44 guard room -> alchemy lab). */
const TOWER_DOORS = segmentRect(64, 44, { col: 0, row: 10 }, { col: 0, row: 11 });
const CHAPEL_YARD = segmentCells([[62, 46], [63, 46]]);
/** The great hall's west / east doors (rows 9-11) and the chapel yard's door to the breach. */
const GREAT_HALL_WEST_DOOR = segmentRect(61, 46, { col: 0, row: 9 }, { col: 0, row: 11 });
const GREAT_HALL_EAST_DOOR = segmentRect(61, 46, { col: 21, row: 9 }, { col: 21, row: 11 });
const BREACH_WEST_DOOR = segmentRect(64, 46, { col: 0, row: 9 }, { col: 0, row: 12 });
const BARRACKS_YARD = segmentCells([[60, 46]]);
const BARRACKS_LANE_DOOR = segmentRect(60, 46, { col: 10, row: 21 }, { col: 11, row: 21 });
const PORTCULLIS_WEST_DOOR = segmentRect(59, 46, { col: 0, row: 9 }, { col: 0, row: 11 });
const SALLY_PORT = segmentCells([[58, 46]]);
/** The sally port's passage into the portcullis hall. */
const SALLY_PORT_DOOR = segmentRect(58, 46, { col: 21, row: 9 }, { col: 21, row: 11 });
/** The ways onto the ring from outside the moat: the sally bridge and the breach ford. */
const SALLY_BRIDGE = segmentRect(58, 46, { col: 9, row: 9 }, { col: 9, row: 12 });
const BREACH_FORD = segmentRect(64, 46, { col: 13, row: 7 }, { col: 13, row: 13 });
/** Inside the curtain wall: the wall walks (cols 58 / 64), the north wall walks and the corner towers. */
const WALL_WALK_INSIDE = [
    ...[44, 45, 46, 47, 48].flatMap((row) => [
        ...segmentRect(58, row, { col: 13, row: 0 }, { col: SIZE - 1, row: SIZE - 1 }),
        ...segmentRect(64, row, { col: 0, row: 0 }, { col: 8, row: SIZE - 1 }),
    ]),
    ...[59, 60, 62, 63].flatMap((col) => segmentRect(col, 43, { col: 0, row: 13 }, { col: SIZE - 1, row: SIZE - 1 })),
    ...segmentRect(58, 43, { col: 8, row: 8 }, { col: SIZE - 1, row: SIZE - 1 }),
    ...segmentRect(64, 43, { col: 0, row: 8 }, { col: 12, row: SIZE - 1 }),
    ...segmentRect(58, 49, { col: 9, row: 0 }, { col: SIZE - 1, row: 12 }),
    ...segmentRect(64, 49, { col: 0, row: 0 }, { col: 12, row: 12 }),
];

/** Castle areas that must each keep some natural Rock (Earth Core always has stone to work with). */
const STONE_AREAS: Record<string, [number, number][]> = {
    'royal chambers': [[59, 44], [60, 44], [59, 45], [60, 45]],
    'wizard tower': [[62, 44], [63, 44], [62, 45], [63, 45]],
    'training ring': [[59, 47], [60, 47], [59, 48], [60, 48]],
    garden: [[62, 47], [63, 47], [62, 48], [63, 48]],
    'west wall': [43, 44, 45, 46, 47, 48, 49].map((row): [number, number] => [58, row]),
    'east wall': [43, 44, 45, 46, 47, 48, 49].map((row): [number, number] => [64, row]),
    'north wall': [59, 60, 61, 62, 63].map((col): [number, number] => [col, 43]),
    'south wall': [59, 60, 61, 62, 63].map((col): [number, number] => [col, 49]),
    'row-46 wing': [[59, 46], [60, 46], [62, 46], [63, 46]],
    'keep and courtyard': [44, 45, 46, 47, 48].map((row): [number, number] => [61, row]),
};

/** A mission's route using only the given segments (everything else walled off). */
function routeWithin(rooms: [number, number][], from: GridCell, to: GridCell) {
    const inMission = new Set(rooms.map(([c, r]) => segmentAddress(c, r)));
    const grid = stitchCastle().map((cells, row) =>
        cells.map((type, col) =>
            inMission.has(segmentAddress(COL0 + Math.floor(col / SIZE), ROW0 + Math.floor(row / SIZE))) ? type : TerrainType.Rock,
        ),
    );
    return { grid, path: findPath(grid, from, to) };
}

describe('castle segments (58-64 x 43-49)', () => {
    it('fills the 7x7 block around the existing gate and courtyard with 22x22 segments', () => {
        expect(CASTLE_SEGMENTS).toHaveLength(COLS * ROWS - 2);
        expect(byAddress.size).toBe(COLS * ROWS);
        for (const s of CASTLE_SEGMENTS) {
            expect(s.id.startsWith(`${s.gridCol}_${s.gridRow}_`)).toBe(true);
            expect(s.description.length, `${s.id} description`).toBeGreaterThan(0);
            expect(s.terrain).toHaveLength(SIZE);
            for (const row of s.terrain) expect(row).toHaveLength(SIZE);
        }
    });

    it('lines up with every neighbour, including the existing gate, courtyard and 60_50', () => {
        for (const [address, terrain] of byAddress) {
            const [col, row] = address.split('_').map(Number);
            const east = byAddress.get(`${col + 1}_${row}`);
            const south = byAddress.get(`${col}_${row + 1}`);
            if (east) expect(checkSeam(terrain, east, 'east').mismatches, `${address} east`).toEqual([]);
            if (south) expect(checkSeam(terrain, south, 'south').mismatches, `${address} south`).toEqual([]);
        }
        const westGuardhouse = byAddress.get('60_49')!;
        expect(checkSeam(westGuardhouse, MAP_SEGMENT_60_50_CAVE_ROAD, 'south').mismatches).toEqual([]);
    });

    it('lets you walk from the gate approach to every open cell, POI and network node', () => {
        const grid = stitchCastle();
        const gate = segmentBlockCell(BLOCK, SIZE, 61, 49, { col: 10, row: 17 });
        const reached = floodFrom(grid, gate.col, gate.row);

        const unreachable: string[] = [];
        grid.forEach((cells, row) =>
            cells.forEach((type, col) => {
                if (isPassable(type) && !reached[row][col]) unreachable.push(`${col},${row}`);
            }),
        );
        expect(unreachable).toEqual([]);

        for (const s of CASTLE_SEGMENTS) {
            const at = (col: number, row: number) => segmentBlockCell(BLOCK, SIZE, s.gridCol, s.gridRow, { col, row });
            for (const poi of s.pointsOfInterest) {
                const cell = at(poi.col, poi.row);
                expect(reached[cell.row][cell.col], poi.id).toBe(true);
            }
            for (const node of s.network.nodes) {
                if (node.position.kind !== 'gridPoint') continue;
                const cell = at(node.position.col, node.position.row);
                expect(reached[cell.row][cell.col], node.id).toBe(true);
            }
        }
    });

    it('uses unique POI and node ids, and network edges only name known nodes', () => {
        const poiIds = CASTLE_SEGMENTS.flatMap((s) => s.pointsOfInterest.map((p) => p.id));
        expect(new Set(poiIds).size).toBe(poiIds.length);

        const nodeIds = new Set(CASTLE_SEGMENTS.flatMap((s) => s.network.nodes.map((n) => n.id)));
        for (const node of CASTLE_COURTYARD_NETWORK.nodes) nodeIds.add(node.id);
        for (const s of CASTLE_SEGMENTS) {
            for (const [a, b] of s.network.edges) {
                expect(nodeIds.has(a), `${s.id}: ${a}`).toBe(true);
                expect(nodeIds.has(b), `${s.id}: ${b}`).toBe(true);
            }
        }
    });

    it('reaches the training ring only through the courtyard west door, and its quest rooms only through the ring', () => {
        const grid = stitchCastle();
        expect(reachedIn(grid, TRAINING_RING)).toBeGreaterThan(0);
        const shut = paintCells(grid, COURTYARD_WEST_DOORWAY, TerrainType.Rock);
        expect(reachedIn(shut, TRAINING_RING, BARRACKS_LANE)).toBe(0);
        // The lane still joins the crossroads to the barracks.
        expect(reachedIn(shut, BARRACKS_LANE)).toBeGreaterThan(0);
        // The west guardhouse and storerooms (Raid the Larder) open only onto the ring.
        // Rows 0-8 are the rooms inside the south wall; the rest of row 49 is outside the moat.
        const questRooms = [
            ...segmentRect(60, 49, { col: 0, row: 0 }, { col: SIZE - 1, row: 8 }),
            ...segmentRect(59, 49, { col: 0, row: 0 }, { col: SIZE - 1, row: 8 }),
        ];
        expect(reachedIn(grid, questRooms)).toBeGreaterThan(0);
        expect(reachedIn(shut, questRooms)).toBe(0);
    });

    it('opens the garden to the courtyard, the crossroads and the two quest rooms only', () => {
        const grid = stitchCastle();
        expect(reachedIn(paintCells(grid, COURTYARD_WEST_DOORWAY, TerrainType.Rock), GARDEN)).toBeGreaterThan(0);
        const shut = paintCells(
            grid,
            [
                ...COURTYARD_EAST_DOORWAY,
                ...segmentRect(61, 47, { col: 21, row: 9 }, { col: 21, row: 11 }), // crossroads east exit
                ...segmentRect(62, 48, { col: 10, row: 21 }, { col: 11, row: 21 }), // east guardhouse door
                ...segmentRect(63, 48, { col: 10, row: 21 }, { col: 11, row: 21 }), // ice house door
            ],
            TerrainType.Rock,
        );
        expect(reachedIn(shut, GARDEN)).toBe(0);
    });

    it('has courtyard doorways at least 4 wide west and east, and passable courtyard POIs', () => {
        for (const cell of [...COURTYARD_WEST_DOORWAY, ...COURTYARD_EAST_DOORWAY]) {
            expect(isPassable(stitchCastle()[cell.row][cell.col])).toBe(true);
        }
        for (const poi of [COURTYARD_WEST_DOOR, COURTYARD_EAST_DOOR, COURTYARD_ENTRY_SOUTH]) {
            expect(isPassable(MAP_SEGMENT_61_48_CASTLE_COURTYARD[poi.row][poi.col])).toBe(true);
        }
    });

    it('reaches the throne room only over the chasm bridge', () => {
        const grid = stitchCastle();
        expect(reachedIn(grid, THRONE_ROOM)).toBeGreaterThan(0);
        expect(reachedIn(paintCells(grid, THRONE_DOOR, TerrainType.Rock), THRONE_ROOM)).toBe(0);
    });

    it('reaches the royal chambers only from the west wall walk, and the tower only from the east', () => {
        const grid = stitchCastle();
        expect(reachedIn(grid, ROYAL_CHAMBERS)).toBeGreaterThan(0);
        expect(reachedIn(paintCells(grid, ROYAL_CHAMBER_DOORS, TerrainType.Rock), ROYAL_CHAMBERS)).toBe(0);
        expect(reachedIn(grid, WIZARDS_TOWER)).toBeGreaterThan(0);
        expect(reachedIn(paintCells(grid, TOWER_DOORS, TerrainType.Rock), WIZARDS_TOWER)).toBe(0);
    });

    it('runs the row-46 wing from the great hall west to the sally port and east to the breach', () => {
        const grid = stitchCastle();
        const local = (col: number, row: number, cell: GridCell) => segmentBlockCell(BLOCK, SIZE, col, row, cell);
        const joined = (g: TerrainType[][], from: GridCell, to: GridCell) => floodFrom(g, from.col, from.row)[to.row][to.col];

        // Chapel yard: from the great hall door round to the breach without leaving the yard.
        const chapelEntry = local(62, 46, { col: 1, row: 10 });
        const chapelExit = local(64, 46, { col: 6, row: 10 });
        expect(joined(paintCells(grid, GREAT_HALL_EAST_DOOR, TerrainType.Rock), chapelEntry, chapelExit)).toBe(true);
        // ...and it opens only to the great hall and the breach.
        expect(reachedIn(paintCells(grid, [...GREAT_HALL_EAST_DOOR, ...BREACH_WEST_DOOR], TerrainType.Rock), CHAPEL_YARD)).toBe(0);

        // Barracks yard: from the lane door west through the portcullis hall to the sally port.
        const barracksEntry = local(60, 46, { col: 10, row: 19 });
        const sallyPort = local(58, 46, { col: 15, row: 10 });
        const yardOnly = paintCells(grid, [...GREAT_HALL_WEST_DOOR, ...BARRACKS_LANE_DOOR], TerrainType.Rock);
        expect(joined(yardOnly, barracksEntry, sallyPort)).toBe(true);
        expect(reachedIn(grid, BARRACKS_YARD)).toBeGreaterThan(0);
        // ...and it opens only to the lane, the great hall and the portcullis hall.
        const shut = paintCells(grid, [...GREAT_HALL_WEST_DOOR, ...BARRACKS_LANE_DOOR, ...PORTCULLIS_WEST_DOOR], TerrainType.Rock);
        expect(reachedIn(shut, BARRACKS_YARD)).toBe(0);
        expect(reachedIn(shut, SALLY_PORT)).toBeGreaterThan(0);

        // Great hall: north onto the bridge, the only way to the throne room.
        expect(joined(grid, local(61, 46, { col: 10, row: 19 }), local(61, 44, { col: 10, row: 4 }))).toBe(true);
    });

    it('marks entry, exit and boss spots for the row 44-46 missions', () => {
        const pois = new Map(CASTLE_SEGMENTS.flatMap((s) => s.pointsOfInterest.map((p) => [p.id, p] as const)));
        for (const id of [
            '61_46_entry_south',
            '61_45_exit_north',
            '61_44_entry_south',
            '61_44_throne',
            '60_46_entry_south',
            '59_46_exit_west',
            '62_46_entry_west',
            '63_46_exit_east',
            '59_44_entry_west',
            '59_44_exit_east',
            '59_44_boss',
            '59_45_exit_east',
            '60_45_entry_west',
            '63_44_entry_east',
            '63_44_crucible',
            '63_45_binding_circle',
            '63_45_great_circle',
        ]) {
            expect(pois.has(id), id).toBe(true);
        }
        expect(pois.get('61_44_throne')!.tags).toContain('boss');
        expect(pois.get('63_45_great_circle')!.tags).toContain('boss');
        expect(pois.get('59_44_boss')!.tags).toContain('boss');
    });

    it('opens the outer ring inward only at the sally port, the breach and one door each into the royal chambers and the tower', () => {
        const grid = stitchCastle();
        const outside = [...SALLY_BRIDGE, ...BREACH_FORD];
        expect(reachedIn(paintCells(grid, outside, TerrainType.Rock), WALL_WALK_INSIDE)).toBeGreaterThan(0);
        const shut = paintCells(
            grid,
            [...outside, ...SALLY_PORT_DOOR, ...BREACH_WEST_DOOR, ...ROYAL_CHAMBER_DOORS, ...TOWER_DOORS],
            TerrainType.Rock,
        );
        expect(reachedIn(shut, WALL_WALK_INSIDE)).toBe(0);
    });

    it('winds the west and east wall walks at least 2 wide from entry to exit', () => {
        const pois = new Map(CASTLE_SEGMENTS.flatMap((s) => s.pointsOfInterest.map((p) => [p.id, { poi: p, seg: s }] as const)));
        const at = (id: string): GridCell => {
            const found = pois.get(id);
            if (!found) throw new Error(`missing POI ${id}`);
            return segmentBlockCell(BLOCK, SIZE, found.seg.gridCol, found.seg.gridRow, found.poi);
        };
        const walks: [[number, number][], string, string][] = [
            [[[58, 46], [58, 45], [58, 44]], '58_46_entry_east', '58_44_exit_east'],
            [[[64, 46], [64, 45], [64, 44]], '64_46_entry_west', '64_44_exit_west'],
        ];
        for (const [rooms, entry, exit] of walks) {
            const from = at(entry);
            const to = at(exit);
            expect(pois.get(entry)!.poi.tags).toContain('entry');
            expect(pois.get(exit)!.poi.tags).toContain('exit');
            const { grid, path } = routeWithin(rooms, from, to);
            expect(path, `${entry} -> ${exit}`).not.toBeNull();
            // Winding: well over the straight line (it doubles back through the murder-hole gallery).
            expect(path!.length).toBeGreaterThan(1.6 * Math.hypot(from.col - to.col, from.row - to.row));
            // Never squeezed to 1 wide on the way.
            const narrow = new Set(findNarrowGaps(grid, 1).map((g) => `${g.cell.col},${g.cell.row}`));
            expect(path!.cells.filter((c) => narrow.has(`${c.col},${c.row}`))).toEqual([]);
            // Enemy spawn spots along the walk.
            for (const [col, row] of rooms) {
                const seg = CASTLE_SEGMENTS.find((s) => s.gridCol === col && s.gridRow === row)!;
                expect(seg.pointsOfInterest.some((p) => p.type === 'enemySpawn'), seg.id).toBe(true);
            }
        }
    });

    it('lays most castle stone as Brick and keeps some natural Rock in every quarter', () => {
        const grid = stitchCastle();
        const count = (cells: GridCell[]) => {
            let rock = 0;
            let brick = 0;
            for (const { col, row } of cells) {
                if (grid[row][col] === TerrainType.Rock) rock++;
                if (grid[row][col] === TerrainType.Brick) brick++;
            }
            return { rock, brick };
        };
        for (const [name, addresses] of Object.entries(STONE_AREAS)) {
            expect(count(segmentCells(addresses)).rock, name).toBeGreaterThan(0);
        }
        const { rock, brick } = count(segmentCells([...byAddress.keys()].map((a) => a.split('_').map(Number) as [number, number])));
        expect(brick / (rock + brick)).toBeGreaterThanOrEqual(0.7);
    });

    it('marks entry, exit, boss and campfire spots for the south-band missions', () => {
        const pois = new Map(CASTLE_SEGMENTS.flatMap((s) => s.pointsOfInterest.map((p) => [p.id, p] as const)));
        for (const id of [
            '61_47_exit_north',
            '61_47_entry_south',
            '60_48_entry_east',
            '60_47_exit_west',
            '59_48_entry_east',
            '59_47_exit_campfires',
            '62_48_entry_west',
            '63_48_exit_north',
            '62_47_entry_west',
            '62_47_boss',
            // Scavenging quests (Raid the Larder, Forage the Garden).
            '60_49_exit_west',
            '59_49_entry_east',
            '59_49_search_west',
            '59_49_search_middle',
            '62_48_herb_beds_north',
            '63_48_fruit_trees',
            '63_48_exit_south',
            '63_49_entry_north',
            '63_49_cold_store_west',
            '63_49_cold_store_east',
        ]) {
            expect(pois.has(id), id).toBe(true);
        }
        const campfires = CASTLE_SEGMENTS.find((s) => s.id === '59_47_archery_green')!.pointsOfInterest.filter(
            (p) => p.type === 'campfire',
        );
        expect(campfires).toHaveLength(2);
    });
});
