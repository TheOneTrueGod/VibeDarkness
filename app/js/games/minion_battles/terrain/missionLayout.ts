/**
 * Mission-local map layout: destination tiles plus a spawn slot filled by the campaign home.
 *
 * Placement uses the layout matrix, not each segment's world-grid `gridCol`/`gridRow`.
 * See `composeMissionMap` and `storylines/homeBase.ts`.
 */

import { offsetZone } from './zones';
import { TerrainType } from './TerrainType';
import { TerrainGrid, CELL_SIZE, stitchTerrain, getStitchLayoutMetrics } from './TerrainGrid';
import type { MapSegmentPOI, MapSegmentZone } from './segmentSchema';
import type { NetworkEdgeDef } from './networkSchema';
import {
    getSegment,
    getMissionSegmentNetworkFromPlacements,
    type ResolvedNetworkNode,
    type ResolvedSegmentPlacement,
} from './segmentRegistry';

/** Destination segment, the campaign spawn/home slot, or an empty hole (impassable void). */
export type MissionLayoutCell =
    | { kind: 'segment'; id: string }
    | { kind: 'spawn' }
    | null;

/** [tileRow][tileCol] — same nesting as `stitchTerrain`. */
export type MissionMapLayout = MissionLayoutCell[][];

export interface ComposedMissionMap {
    terrainGrid: TerrainGrid;
    cols: number;
    rows: number;
    worldWidth: number;
    worldHeight: number;
    /** Unique segment ids used in this composition (destinations + resolved spawn). */
    segmentIds: string[];
    placements: ResolvedSegmentPlacement[];
    pois: MapSegmentPOI[];
    zones: MapSegmentZone[];
    network: { nodes: ResolvedNetworkNode[]; edges: NetworkEdgeDef[] };
    playerSpawnPoints: Array<{ col: number; row: number }>;
    spawnPlacement: ResolvedSegmentPlacement | null;
}

function resolveCellId(cell: MissionLayoutCell, spawnSegmentId: string): string | null {
    if (cell == null) return null;
    if (cell.kind === 'spawn') return spawnSegmentId;
    return cell.id;
}

function offsetPoi(poi: MapSegmentPOI, originCol: number, originRow: number): MapSegmentPOI {
    return {
        ...poi,
        col: poi.col + originCol,
        row: poi.row + originRow,
        tags: poi.tags ? [...poi.tags] : undefined,
    };
}

function uniqueIds(ids: string[]): string[] {
    return [...new Set(ids)];
}

/** Segment ids named as destination tiles in the layout (spawn slots are not included). */
export function layoutDestinationSegmentIds(layout: MissionMapLayout): string[] {
    const ids: string[] = [];
    for (const row of layout) {
        for (const cell of row) {
            if (cell?.kind === 'segment') ids.push(cell.id);
        }
    }
    return uniqueIds(ids);
}

/**
 * Stitch `layout` into one terrain grid. Spawn cells use `spawnSegmentId`.
 * Origins match {@link stitchTerrain} so POIs/zones/network sit on the same cells as bedrock.
 */
export function composeMissionMap(
    layout: MissionMapLayout,
    spawnSegmentId: string,
    fill: TerrainType = TerrainType.Grass,
): ComposedMissionMap {
    const terrainTiles: (TerrainType[][] | null)[][] = layout.map((row) =>
        row.map((cell) => {
            const id = resolveCellId(cell, spawnSegmentId);
            if (id == null) return null;
            const seg = getSegment(id);
            if (!seg) {
                throw new Error(`composeMissionMap: segment not registered: ${id}`);
            }
            return seg.terrain as TerrainType[][];
        }),
    );

    const metrics = getStitchLayoutMetrics(terrainTiles);
    const stitched = stitchTerrain(terrainTiles, fill);
    const cols = metrics.totalWidth;
    const rows = metrics.totalHeight;
    const terrainGrid = TerrainGrid.createTerrainFromArray(cols, rows, CELL_SIZE, stitched, fill);

    const placements: ResolvedSegmentPlacement[] = [];
    const pois: MapSegmentPOI[] = [];
    const zones: MapSegmentZone[] = [];
    const playerSpawnPoints: Array<{ col: number; row: number }> = [];
    let spawnPlacement: ResolvedSegmentPlacement | null = null;
    const usedIds: string[] = [];

    for (let tr = 0; tr < layout.length; tr++) {
        const row = layout[tr] ?? [];
        for (let tc = 0; tc < row.length; tc++) {
            const cell = row[tc];
            const id = resolveCellId(cell, spawnSegmentId);
            if (id == null) continue;
            const seg = getSegment(id);
            if (!seg) continue;

            const originCol = metrics.originColByTile[tc] ?? 0;
            const originRow = metrics.originRowByTile[tr] ?? 0;
            const placement: ResolvedSegmentPlacement = {
                id,
                originCol,
                originRow,
                width: seg.width,
                height: seg.height,
            };
            placements.push(placement);
            usedIds.push(id);

            const isSpawnSlot = cell?.kind === 'spawn';
            if (isSpawnSlot) spawnPlacement = placement;

            for (const poi of seg.pointsOfInterest) {
                const shifted = offsetPoi(poi, originCol, originRow);
                pois.push(shifted);
                if (isSpawnSlot && poi.type === 'playerSpawn') {
                    playerSpawnPoints.push({ col: shifted.col, row: shifted.row });
                }
            }
            for (const zone of seg.zones) {
                zones.push(offsetZone(zone, originCol, originRow));
            }
        }
    }

    return {
        terrainGrid,
        cols,
        rows,
        worldWidth: cols * CELL_SIZE,
        worldHeight: rows * CELL_SIZE,
        segmentIds: uniqueIds(usedIds),
        placements,
        pois,
        zones,
        network: getMissionSegmentNetworkFromPlacements(placements),
        playerSpawnPoints,
        spawnPlacement,
    };
}
