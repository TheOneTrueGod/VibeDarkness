import { SEGMENT_PREVIEW_SIZE_PX } from '../../../../games/minion_battles/terrain/segmentPreviewSvg';

export type WorldMapZoomId = 'region';

/** One world-map zoom level: how big a segment tile is and how far the edge buttons scroll. */
export interface WorldMapZoomLevel {
    id: WorldMapZoomId;
    label: string;
    /** Edge length of one segment tile, in pixels. */
    tilePx: number;
    /** Gap between tiles, in pixels. */
    gapPx: number;
    /** Segments moved per click of an edge scroll button. */
    scrollStep: number;
}

export const WORLD_MAP_ZOOM_LEVELS: Record<WorldMapZoomId, WorldMapZoomLevel> = {
    region: { id: 'region', label: 'Region', tilePx: SEGMENT_PREVIEW_SIZE_PX, gapPx: 1, scrollStep: 10 },
};

export const DEFAULT_WORLD_MAP_ZOOM: WorldMapZoomId = 'region';

/** How many segment preview SVGs are generated (and saved) at once. */
export const WORLD_MAP_SVG_CONCURRENCY = 1;

/** Where the world map centers when no segment is open. */
export const WORLD_MAP_DEFAULT_CENTER = { col: 50, row: 50 };
