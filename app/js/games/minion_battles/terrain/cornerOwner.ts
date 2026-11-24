/**
 * Corner owners: which terrain fills the cut corner of a hard-edge cell.
 *
 * A hard-edge cell (rock, gravel, brick, briar) cuts a corner when both of its sides at that corner are a
 * different family. The cut must show whatever actually reaches that grid vertex from the other cells, and
 * every cell that cuts a corner at the same vertex must agree on it. So the answer belongs to the vertex,
 * not the cell: `resolveVertexOwner` looks at the four cells around it.
 *
 * Rules, in order:
 * 1. Drop hard-edge cells that cut their own corner at the vertex (they do not reach it). Soft
 *    (marching-squares) cells always reach it.
 * 2. The most common terrain among the cells left owns the vertex.
 * 3. On a tie, the terrain drawn later in `LAYER_ORDER` wins.
 * 4. If no cell reaches the vertex, the base ground (`CORNER_FALLBACK_TERRAIN`) shows.
 */
import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';
import { LAYER_ORDER } from './terrainLayerOrder';

/** Shown when no cell reaches a vertex; matches the dirt base `TerrainRenderer` fills first. */
export const CORNER_FALLBACK_TERRAIN = TerrainType.Dirt;

/** True when `other` draws as the same material as `self` (no edge between them, from `self`'s side). */
export function isHardEdgeFamily(self: TerrainType, other: TerrainType): boolean {
    return other === self || TERRAIN_PROPERTIES[self].hardEdgeFamily.includes(other);
}

/**
 * Does cell (col, row) reach vertex (vx, vy), one of its four corners? Soft terrain always does; a
 * hard-edge cell does unless both of its sides at that corner are another family (it cuts the corner).
 */
export function cellReachesVertex(
    col: number,
    row: number,
    vx: number,
    vy: number,
    getTypeAt: (c: number, r: number) => TerrainType,
): boolean {
    const type = getTypeAt(col, row);
    if (TERRAIN_PROPERTIES[type].renderStrategy !== 'hard-edge') return true;
    const vertical = getTypeAt(col, vy === row ? row - 1 : row + 1);
    const horizontal = getTypeAt(vx === col ? col - 1 : col + 1, row);
    return isHardEdgeFamily(type, vertical) || isHardEdgeFamily(type, horizontal);
}

function layerRank(type: TerrainType): number {
    return LAYER_ORDER.indexOf(type);
}

/** The terrain that owns grid vertex (vx, vy): the top-left corner of cell (vx, vy). See file header. */
export function resolveVertexOwner(
    vx: number,
    vy: number,
    getTypeAt: (c: number, r: number) => TerrainType,
): TerrainType {
    const counts = new Map<TerrainType, number>();
    for (let row = vy - 1; row <= vy; row++) {
        for (let col = vx - 1; col <= vx; col++) {
            if (!cellReachesVertex(col, row, vx, vy, getTypeAt)) continue;
            const type = getTypeAt(col, row);
            counts.set(type, (counts.get(type) ?? 0) + 1);
        }
    }
    let owner = CORNER_FALLBACK_TERRAIN;
    let ownerCount = 0;
    for (const [type, count] of counts) {
        if (count > ownerCount || (count === ownerCount && layerRank(type) > layerRank(owner))) {
            owner = type;
            ownerCount = count;
        }
    }
    return owner;
}
