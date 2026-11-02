import { TerrainType, TERRAIN_PROPERTIES } from './TerrainType';
import type { MapSegmentData } from './segmentSchema';

/** Default edge length, in pixels, of a segment preview (one world-map tile at region zoom). */
export const SEGMENT_PREVIEW_SIZE_PX = 24;

/**
 * Which terrain wins when several types fall into one preview pixel; higher wins.
 * Paths first, then water, then rock walls, so a segment's routes and barriers survive
 * the downscale. Grass is the background and loses to everything.
 */
export const SEGMENT_PREVIEW_PRIORITY: Record<TerrainType, number> = {
    [TerrainType.Dirt]: 8,
    [TerrainType.DeepWater]: 7,
    [TerrainType.Water]: 6,
    [TerrainType.ShallowWater]: 5,
    [TerrainType.Rock]: 4,
    [TerrainType.Gravel]: 3,
    [TerrainType.Impassable]: 2,
    [TerrainType.ThickGrass]: 1,
    [TerrainType.Grass]: 0,
};

/** Source cell range [start, end) covered by preview pixel `px` along an axis of `cells` cells. */
function sourceRange(px: number, size: number, cells: number): [number, number] {
    const start = Math.floor((px * cells) / size);
    const end = Math.max(start + 1, Math.ceil(((px + 1) * cells) / size));
    return [start, Math.min(end, cells)];
}

/** The terrain type shown at each preview pixel, as `size` rows of `size` types. */
export function summarizeSegmentTerrain(
    segment: Pick<MapSegmentData, 'terrain' | 'width' | 'height'>,
    size = SEGMENT_PREVIEW_SIZE_PX,
): TerrainType[][] {
    const { terrain, width, height } = segment;
    const rows: TerrainType[][] = [];
    for (let py = 0; py < size; py++) {
        const [r0, r1] = sourceRange(py, size, height);
        const row: TerrainType[] = [];
        for (let px = 0; px < size; px++) {
            const [c0, c1] = sourceRange(px, size, width);
            let best = TerrainType.Grass;
            let bestPriority = -Infinity;
            for (let r = r0; r < r1; r++) {
                for (let c = c0; c < c1; c++) {
                    const type = (terrain[r]?.[c] ?? TerrainType.Grass) as TerrainType;
                    const priority = SEGMENT_PREVIEW_PRIORITY[type] ?? 0;
                    if (priority > bestPriority) {
                        best = type;
                        bestPriority = priority;
                    }
                }
            }
            row.push(best);
        }
        rows.push(row);
    }
    return rows;
}

/**
 * Zoomed-out SVG of a segment: a `size`×`size` pixel image, one rect per horizontal run of
 * the same terrain (the most common terrain is drawn once as the background).
 */
export function generateSegmentPreviewSvg(
    segment: Pick<MapSegmentData, 'terrain' | 'width' | 'height'>,
    size = SEGMENT_PREVIEW_SIZE_PX,
): string {
    const pixels = summarizeSegmentTerrain(segment, size);

    const counts = new Map<TerrainType, number>();
    for (const row of pixels) for (const type of row) counts.set(type, (counts.get(type) ?? 0) + 1);
    let background = TerrainType.Grass;
    let backgroundCount = -1;
    for (const [type, count] of counts) {
        if (count > backgroundCount) {
            background = type;
            backgroundCount = count;
        }
    }

    const rects: string[] = [`<rect width="${size}" height="${size}" fill="${TERRAIN_PROPERTIES[background].color}"/>`];
    pixels.forEach((row, y) => {
        let x = 0;
        while (x < size) {
            const type = row[x];
            let end = x + 1;
            while (end < size && row[end] === type) end++;
            if (type !== background) {
                rects.push(`<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${TERRAIN_PROPERTIES[type].color}"/>`);
            }
            x = end;
        }
    });

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}
