import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapSegmentData } from '../../../../games/minion_battles/terrain/segmentSchema';
import { generateSegmentPreviewSvg } from '../../../../games/minion_battles/terrain/segmentPreviewSvg';
import {
    fetchSegmentData,
    fetchWorldMapTiles,
    saveWorldMapTileSvg,
    type WorldMapTileRecord,
    type WorldMapTileStatus,
} from './worldMapApi';
import { WORLD_MAP_SVG_CONCURRENCY } from './worldMapConfig';

/** A segment as the world map draws it. */
export interface WorldMapTile {
    id: string;
    gridCol: number;
    gridRow: number;
    status: WorldMapTileStatus;
    /** Preview SVG markup; present for fresh and stale tiles. */
    svg: string | null;
    generating: boolean;
    /** Generating or saving the preview failed; not retried until the world map reloads. */
    failed: boolean;
}

type JobState = 'running' | 'failed';

export function worldMapTileKey(col: number, row: number): string {
    return `${col},${row}`;
}

/**
 * Loads every segment's preview status in one request, then regenerates missing and stale
 * previews `WORLD_MAP_SVG_CONCURRENCY` at a time (nearest to `center` first), saving each one.
 * Segment positions come from `segments` (the editor's merged registry + API list).
 */
export function useWorldMapTiles(
    segments: Map<string, MapSegmentData>,
    center: { col: number; row: number },
): { tilesByCell: Map<string, WorldMapTile>; error: string | null } {
    const [records, setRecords] = useState<Map<string, WorldMapTileRecord> | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [jobs, setJobs] = useState<Record<string, JobState>>({});
    const centerRef = useRef(center);
    centerRef.current = center;
    const segmentsRef = useRef(segments);
    segmentsRef.current = segments;
    const aliveRef = useRef(true);

    useEffect(() => {
        aliveRef.current = true;
        fetchWorldMapTiles()
            .then((list) => {
                if (aliveRef.current) setRecords(new Map(list.map((r) => [r.id, r])));
            })
            .catch((err) => {
                if (aliveRef.current) setError(err instanceof Error ? err.message : 'Failed to load world map');
            });
        return () => { aliveRef.current = false; };
    }, []);

    const tiles = useMemo(() => {
        const out: WorldMapTile[] = [];
        if (!records) return out;
        const ids = new Set([...segments.keys(), ...records.keys()]);
        for (const id of ids) {
            const seg = segments.get(id);
            const record = records.get(id);
            const gridCol = seg?.gridCol ?? record?.gridCol;
            const gridRow = seg?.gridRow ?? record?.gridRow;
            if (gridCol == null || gridRow == null) continue;
            out.push({
                id,
                gridCol,
                gridRow,
                status: record?.status ?? 'missing',
                svg: record?.svg ?? null,
                generating: jobs[id] === 'running',
                failed: jobs[id] === 'failed',
            });
        }
        return out;
    }, [segments, records, jobs]);

    // Start the next preview jobs whenever a slot is free.
    useEffect(() => {
        const running = Object.values(jobs).filter((j) => j === 'running').length;
        const free = WORLD_MAP_SVG_CONCURRENCY - running;
        if (free <= 0) return;
        const { col, row } = centerRef.current;
        const next = tiles
            .filter((t) => t.status !== 'fresh' && jobs[t.id] == null)
            .sort((a, b) =>
                Math.hypot(a.gridCol - col, a.gridRow - row) - Math.hypot(b.gridCol - col, b.gridRow - row))
            .slice(0, free);
        if (next.length === 0) return;

        setJobs((prev) => {
            const updated = { ...prev };
            for (const t of next) updated[t.id] = 'running';
            return updated;
        });
        for (const tile of next) {
            void (async () => {
                try {
                    const data = segmentsRef.current.get(tile.id) ?? await fetchSegmentData(tile.id);
                    const svg = generateSegmentPreviewSvg(data);
                    await saveWorldMapTileSvg(tile.id, svg);
                    if (!aliveRef.current) return;
                    setRecords((prev) => {
                        const updated = new Map(prev);
                        const existing = updated.get(tile.id);
                        updated.set(tile.id, { id: tile.id, source: existing?.source ?? 'ts', ...existing, status: 'fresh', svg });
                        return updated;
                    });
                    setJobs((prev) => {
                        const updated = { ...prev };
                        delete updated[tile.id];
                        return updated;
                    });
                } catch (err) {
                    console.error(`[WorldMap] Preview for ${tile.id} failed:`, err);
                    if (aliveRef.current) setJobs((prev) => ({ ...prev, [tile.id]: 'failed' }));
                }
            })();
        }
    }, [tiles, jobs]);

    const tilesByCell = useMemo(
        () => new Map(tiles.map((t) => [worldMapTileKey(t.gridCol, t.gridRow), t])),
        [tiles],
    );

    return { tilesByCell, error };
}
