import type { MapSegmentData, MapSegmentPOI, MapSegmentZone } from './segmentSchema';
import { MapSegmentDataSchema } from './segmentSchema';
import { TerrainType } from './TerrainType';
import { offsetZone } from './zones';

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

/** Parse unknown JSON and register if valid. Returns null and logs warn on failure. */
export function parseAndRegisterSegment(raw: unknown): MapSegmentData | null {
    const result = MapSegmentDataSchema.safeParse(raw);
    if (!result.success) {
        console.warn('[segmentRegistry] Invalid segment data:', result.error.flatten());
        return null;
    }
    registerSegment(result.data);
    return result.data;
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

/**
 * Returns terrain for a segment from the registry, cast to TerrainType[][].
 * Falls back to the provided TS array if the segment is not registered.
 */
export function getTerrainForSegment(id: string, fallback: TerrainType[][]): TerrainType[][] {
    const seg = registry.get(id);
    if (!seg) return fallback;
    return seg.terrain as TerrainType[][];
}
