import React, { useEffect, useRef, useState } from 'react';
import type { MapSegmentData } from '../../../../games/minion_battles/terrain/segmentSchema';
import { useWorldMapTiles, worldMapTileKey, type WorldMapTile } from './useWorldMapTiles';
import { DEFAULT_WORLD_MAP_ZOOM, WORLD_MAP_DEFAULT_CENTER, WORLD_MAP_ZOOM_LEVELS, type WorldMapZoomId } from './worldMapConfig';

interface WorldMapViewProps {
    segments: Map<string, MapSegmentData>;
    /** Segment open in the editor; highlighted, and the map starts centered on it. */
    selectedSegment: MapSegmentData | null;
    onOpenSegment: (id: string) => void;
}

const EDGE_PX = 32;

function Spinner() {
    return <span className="block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />;
}

function Chevron({ d }: { d: string }) {
    return (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
        </svg>
    );
}

function svgDataUri(svg: string): string {
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function TileCell({ tile, col, row, size, selected, onOpen }: {
    tile: WorldMapTile | undefined;
    col: number;
    row: number;
    size: number;
    selected: boolean;
    onOpen: (id: string) => void;
}) {
    const style = { width: size, height: size };
    if (!tile) {
        return (
            <div style={style} className="bg-black flex items-center justify-center text-[10px] text-zinc-600 select-none" title={`${col}, ${row}: no segment`}>
                ?
            </div>
        );
    }
    const showImage = tile.svg != null;
    const showSpinner = tile.generating || (!tile.failed && tile.status !== 'fresh');
    return (
        <button
            type="button"
            style={style}
            className={`relative p-0 overflow-hidden ${showImage ? '' : 'bg-zinc-500'} ${selected ? 'outline outline-2 outline-primary z-10' : 'hover:outline hover:outline-1 hover:outline-white z-0'}`}
            title={`${tile.id} (${col}, ${row})${tile.failed ? ' — preview failed' : ''}`}
            onClick={() => onOpen(tile.id)}
        >
            {showImage && (
                <img src={svgDataUri(tile.svg!)} width={size} height={size} alt="" className="block" style={{ imageRendering: 'pixelated' }} />
            )}
            {showSpinner && (
                <span className={`absolute inset-0 flex items-center justify-center ${showImage ? 'bg-black/30' : ''}`}>
                    <Spinner />
                </span>
            )}
            {tile.failed && !showImage && (
                <span className="absolute inset-0 flex items-center justify-center text-[10px] text-red-300">!</span>
            )}
        </button>
    );
}

/** Zoomed-out grid of every map segment; edge buttons scroll by the zoom level's step. */
export default function WorldMapView({ segments, selectedSegment, onOpenSegment }: WorldMapViewProps) {
    const [zoomId] = useState<WorldMapZoomId>(DEFAULT_WORLD_MAP_ZOOM);
    const zoom = WORLD_MAP_ZOOM_LEVELS[zoomId];
    const [center, setCenter] = useState(() =>
        selectedSegment ? { col: selectedSegment.gridCol, row: selectedSegment.gridRow } : WORLD_MAP_DEFAULT_CENTER);
    const { tilesByCell, error } = useWorldMapTiles(segments, center);

    const areaRef = useRef<HTMLDivElement>(null);
    const [view, setView] = useState({ cols: 0, rows: 0 });
    useEffect(() => {
        const el = areaRef.current;
        if (!el) return;
        const step = zoom.tilePx + zoom.gapPx;
        const measure = () => setView({
            cols: Math.max(1, Math.floor((el.clientWidth + zoom.gapPx) / step)),
            rows: Math.max(1, Math.floor((el.clientHeight + zoom.gapPx) / step)),
        });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [zoom]);

    const firstCol = center.col - Math.floor(view.cols / 2);
    const firstRow = center.row - Math.floor(view.rows / 2);
    const scroll = (dCol: number, dRow: number) =>
        setCenter((c) => ({ col: c.col + dCol * zoom.scrollStep, row: c.row + dRow * zoom.scrollStep }));

    const cells: React.ReactNode[] = [];
    for (let r = 0; r < view.rows; r++) {
        for (let c = 0; c < view.cols; c++) {
            const col = firstCol + c;
            const row = firstRow + r;
            const tile = tilesByCell.get(worldMapTileKey(col, row));
            cells.push(
                <TileCell
                    key={worldMapTileKey(col, row)}
                    tile={tile}
                    col={col}
                    row={row}
                    size={zoom.tilePx}
                    selected={tile != null && tile.id === selectedSegment?.id}
                    onOpen={onOpenSegment}
                />,
            );
        }
    }

    const edgeButton = 'flex items-center justify-center rounded-sm bg-zinc-800/80 text-muted hover:text-white hover:bg-zinc-700 transition-colors';
    const step = zoom.scrollStep;

    return (
        <div className="h-full flex flex-col gap-2 p-3">
            <div className="flex items-center justify-between text-xs text-muted shrink-0">
                <span>{zoom.label} view</span>
                <span className="font-mono">
                    cols {firstCol}–{firstCol + view.cols - 1} · rows {firstRow}–{firstRow + view.rows - 1}
                </span>
                {error && <span className="text-red-400">{error}</span>}
            </div>
            <div
                className="flex-1 min-h-0 grid gap-1"
                style={{ gridTemplateColumns: `${EDGE_PX}px 1fr ${EDGE_PX}px`, gridTemplateRows: `${EDGE_PX}px 1fr ${EDGE_PX}px` }}
            >
                <div />
                <button type="button" className={edgeButton} title={`Up ${step}`} onClick={() => scroll(0, -1)}><Chevron d="M5 15l7-7 7 7" /></button>
                <div />
                <button type="button" className={edgeButton} title={`Left ${step}`} onClick={() => scroll(-1, 0)}><Chevron d="M15 19l-7-7 7-7" /></button>
                <div ref={areaRef} className="min-w-0 min-h-0 overflow-hidden flex items-center justify-center">
                    <div
                        className="grid"
                        style={{
                            gridTemplateColumns: `repeat(${view.cols}, ${zoom.tilePx}px)`,
                            gap: `${zoom.gapPx}px`,
                        }}
                    >
                        {cells}
                    </div>
                </div>
                <button type="button" className={edgeButton} title={`Right ${step}`} onClick={() => scroll(1, 0)}><Chevron d="M9 5l7 7-7 7" /></button>
                <div />
                <button type="button" className={edgeButton} title={`Down ${step}`} onClick={() => scroll(0, 1)}><Chevron d="M19 9l-7 7-7-7" /></button>
                <div />
            </div>
        </div>
    );
}
