import type { MapSegmentData } from '../../../../games/minion_battles/terrain/segmentSchema';

/** Preview status for one segment: "stale" means the SVG is older than the map file. */
export type WorldMapTileStatus = 'fresh' | 'stale' | 'missing';

/** One row of `GET /api/terrain-world`. Grid position is only sent for JSON segments. */
export interface WorldMapTileRecord {
    id: string;
    source: 'json' | 'ts';
    status: WorldMapTileStatus;
    svg: string | null;
    gridCol?: number;
    gridRow?: number;
}

export async function fetchWorldMapTiles(): Promise<WorldMapTileRecord[]> {
    const response = await fetch('/api/terrain-world');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = (await response.json()) as { tiles?: WorldMapTileRecord[] };
    return json.tiles ?? [];
}

export async function fetchSegmentData(id: string): Promise<MapSegmentData> {
    const response = await fetch(`/api/terrain-segments/${id}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as MapSegmentData;
}

export async function saveWorldMapTileSvg(id: string, svg: string): Promise<void> {
    const response = await fetch(`/api/terrain-world/${id}/svg`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ svg }),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
}
