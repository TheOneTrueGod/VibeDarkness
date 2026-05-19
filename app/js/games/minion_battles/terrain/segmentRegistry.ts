import type { MapSegmentData, MapSegmentPOI } from './segmentSchema';
import { MapSegmentDataSchema } from './segmentSchema';
import { TerrainType } from './TerrainType';

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
): MapSegmentData {
    return {
        id,
        gridCol,
        gridRow,
        width: terrain[0]?.length ?? 0,
        height: terrain.length,
        terrain: terrain.map((row) => [...row]),
        pointsOfInterest: pois ?? [],
    };
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
