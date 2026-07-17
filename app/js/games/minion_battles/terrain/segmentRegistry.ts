import type { MapSegmentData, MapSegmentPOI, MapSegmentZone } from './segmentSchema';
import { MapSegmentDataSchema } from './segmentSchema';
import { TerrainType } from './TerrainType';
import { offsetZone } from './zones';
import { CELL_SIZE } from './TerrainGrid';
import type { NetworkEdgeDef, NetworkNodePosition } from './networkSchema';

/**
 * A network node resolved to mission-global pixel coordinates (see `getMissionSegmentNetwork`).
 * `x`/`y` are resolved from segment-local grid/pixel positions to mission-global pixels; `radius`
 * is passed through verbatim from `NetworkNodeDef.radius` — already pixel-space, per
 * `networkSchema.ts`'s doc comment — not derived from grid cells the way `x`/`y` are.
 */
export interface ResolvedNetworkNode {
    id: string;
    x: number;
    y: number;
    radius: number;
    tags: string[];
    segmentId: string;
}

const registry = new Map<string, MapSegmentData>();

export function registerSegment(data: MapSegmentData): void {
    registry.set(data.id, data);
}

export function getSegment(id: string): MapSegmentData | undefined {
    return registry.get(id);
}

export function listSegments(): MapSegmentData[] {
    return Array.from(registry.values());
}

/**
 * Parse unknown JSON and register if valid. Returns null and logs warn on failure.
 * When the segment already exists in the registry (TypeScript startup registration) and the
 * incoming payload omits `zones` or `pointsOfInterest`, those fields are preserved from the
 * existing entry. Terrain-editor JSON often ships terrain only and would otherwise clobber
 * gameplay metadata registered from TypeScript.
 */
export function parseAndRegisterSegment(raw: unknown): MapSegmentData | null {
    const result = MapSegmentDataSchema.safeParse(raw);
    if (!result.success) {
        console.warn('[segmentRegistry] Invalid segment data:', result.error.flatten());
        return null;
    }
    const incoming = result.data;
    const existing = registry.get(incoming.id);
    const merged: MapSegmentData =
        existing == null
            ? incoming
            : {
                  ...incoming,
                  pointsOfInterest:
                      incoming.pointsOfInterest.length > 0
                          ? incoming.pointsOfInterest
                          : existing.pointsOfInterest,
                  zones: incoming.zones.length > 0 ? incoming.zones : existing.zones,
              };
    registerSegment(merged);
    return merged;
}

/** Convert a TypeScript TerrainType[][] (legacy format) to MapSegmentData. */
export function tsTerrainToSegmentData(
    id: string,
    gridCol: number,
    gridRow: number,
    terrain: TerrainType[][],
    pois?: MapSegmentPOI[],
    zones?: MapSegmentZone[],
): MapSegmentData {
    return {
        id,
        gridCol,
        gridRow,
        width: terrain[0]?.length ?? 0,
        height: terrain.length,
        terrain: terrain.map((row) => [...row]),
        pointsOfInterest: pois ?? [],
        zones: zones ?? [],
    };
}

/**
 * Resolves every zone declared on the given segments into mission-global grid coords.
 * Each segment's origin is derived the same way the map-segments convention documents:
 * `originCol = (gridCol - minCol) * width`, `originRow = (gridRow - minRow) * height`,
 * where `minCol`/`minRow` are the smallest world-grid addresses among `segmentIds`.
 * Segments not currently registered (e.g. procedural pads with no segment file) are skipped.
 */
export function getMissionSegmentZones(segmentIds: string[]): MapSegmentZone[] {
    const segments = segmentIds
        .map((id) => registry.get(id))
        .filter((s): s is MapSegmentData => s != null);
    if (segments.length === 0) return [];

    const minCol = Math.min(...segments.map((s) => s.gridCol));
    const minRow = Math.min(...segments.map((s) => s.gridRow));

    const zones: MapSegmentZone[] = [];
    for (const seg of segments) {
        const originCol = (seg.gridCol - minCol) * seg.width;
        const originRow = (seg.gridRow - minRow) * seg.height;
        for (const zone of seg.zones) {
            zones.push(offsetZone(zone, originCol, originRow));
        }
    }
    return zones;
}

/** Resolves a single segment-local `NetworkNodePosition` to mission-global pixel coords. */
function resolveNetworkNodePosition(
    position: NetworkNodePosition,
    originCol: number,
    originRow: number,
): { x: number; y: number } {
    if (position.kind === 'gridPoint') {
        return {
            x: (originCol + position.col) * CELL_SIZE + CELL_SIZE / 2,
            y: (originRow + position.row) * CELL_SIZE + CELL_SIZE / 2,
        };
    }
    return {
        x: originCol * CELL_SIZE + position.x,
        y: originRow * CELL_SIZE + position.y,
    };
}

/**
 * Resolves every network node declared on the given segments into mission-global pixel
 * coordinates, and every edge whose endpoints both resolved. Mirrors `getMissionSegmentZones`'s
 * origin math exactly: `originCol = (gridCol - minCol) * width`, `originRow = (gridRow - minRow) *
 * height`, computed once across `segmentIds`; segments not currently registered are skipped
 * (same behavior as `getMissionSegmentZones`). An edge referencing a node id that wasn't
 * collected (e.g. a typo, or a node defined on a segment not included in `segmentIds`) is
 * dropped with a `console.warn`, matching `parseAndRegisterSegment`'s warn-on-invalid pattern.
 */
export function getMissionSegmentNetwork(segmentIds: string[]): {
    nodes: ResolvedNetworkNode[];
    edges: NetworkEdgeDef[];
} {
    const segments = segmentIds
        .map((id) => registry.get(id))
        .filter((s): s is MapSegmentData => s != null);
    if (segments.length === 0) return { nodes: [], edges: [] };

    const minCol = Math.min(...segments.map((s) => s.gridCol));
    const minRow = Math.min(...segments.map((s) => s.gridRow));

    const nodes: ResolvedNetworkNode[] = [];
    const rawEdges: NetworkEdgeDef[] = [];
    for (const seg of segments) {
        const originCol = (seg.gridCol - minCol) * seg.width;
        const originRow = (seg.gridRow - minRow) * seg.height;
        const network = seg.network;
        if (network == null) continue;
        for (const node of network.nodes) {
            const { x, y } = resolveNetworkNodePosition(node.position, originCol, originRow);
            nodes.push({
                id: node.id,
                x,
                y,
                radius: node.radius ?? 0,
                tags: node.tags ?? [],
                segmentId: seg.id,
            });
        }
        rawEdges.push(...network.edges);
    }

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = rawEdges.filter(([a, b]: NetworkEdgeDef): boolean => {
        if (nodeIds.has(a) && nodeIds.has(b)) return true;
        console.warn(`[segmentRegistry] Dropping network edge with unknown node id(s): [${a}, ${b}]`);
        return false;
    });

    return { nodes, edges };
}

/**
 * Returns terrain for a segment from the registry, cast to TerrainType[][].
 * Falls back to the provided TS array if the segment is not registered.
 */
export function getTerrainForSegment(id: string, fallback: TerrainType[][]): TerrainType[][] {
    const seg = registry.get(id);
    if (!seg) return fallback;
    return seg.terrain as TerrainType[][];
}
