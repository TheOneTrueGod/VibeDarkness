import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
    TERRAIN_COLORS,
    POI_STYLES,
    EDITOR_CELL_SIZE,
    HOVER_OVERLAY_ALPHA,
    POI_RADIUS_ALPHA,
    POI_RADIUS_BORDER_ALPHA,
    ZONE_FILL_COLOR,
    ZONE_FILL_ALPHA,
    ZONE_BORDER_ALPHA,
    ZONE_SELECTED_BORDER_COLOR,
} from './terrainEditorColors';
import { EditorState, EditorActions } from './useEditorState';
import { MapSegmentPOI, MapSegmentZone } from '../../../games/minion_battles/terrain/segmentSchema';
import { TerrainType } from '../../../games/minion_battles/terrain/TerrainType';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TerrainCanvasProps {
    state: EditorState;
    actions: Pick<EditorActions, 'setHoveredCell' | 'paintCells' | 'addPOI' | 'selectPOI' | 'addZone'>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the list of grid cells covered by the brush centered on (col, row).
 *
 * brushSize 1 → 1×1 (just the hovered cell)
 * brushSize 2 → 3×3 square
 * brushSize 3 → 5×5 square
 *
 * Cells outside [0, width) × [0, height) are excluded.
 */
export function getBrushCells(
    col: number,
    row: number,
    brushSize: 1 | 2 | 3 | 4 | 5 | 7,
    width: number,
    height: number,
): { col: number; row: number }[] {
    const half = Math.floor(brushSize / 2);
    const cells: { col: number; row: number }[] = [];

    for (let dc = -half; dc < brushSize - half; dc++) {
        for (let dr = -half; dr < brushSize - half; dr++) {
            const c = col + dc;
            const r = row + dr;
            if (c >= 0 && c < width && r >= 0 && r < height) {
                cells.push({ col: c, row: r });
            }
        }
    }

    return cells;
}

/**
 * Convert a CSS hex color (#RRGGBB or #RGB) and an alpha value [0, 1] into
 * a CSS rgba() string suitable for canvas fillStyle / strokeStyle.
 */
function hexToRgba(hex: string, alpha: number): string {
    let h = hex.replace('#', '');
    if (h.length === 3) {
        h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

/** Normalizes two arbitrary corners into a topLeft/bottomRight pair (min/max). */
function normalizeCorners(
    a: { col: number; row: number },
    b: { col: number; row: number },
): { topLeft: { col: number; row: number }; bottomRight: { col: number; row: number } } {
    return {
        topLeft: { col: Math.min(a.col, b.col), row: Math.min(a.row, b.row) },
        bottomRight: { col: Math.max(a.col, b.col), row: Math.max(a.row, b.row) },
    };
}

/** Draws a zone's box/circle overlay (or a live drag preview when `isPreview` is set). */
function drawZone(
    ctx: CanvasRenderingContext2D,
    zone: Pick<MapSegmentZone, 'shape' | 'topLeft' | 'bottomRight'>,
    cellSize: number,
    isSelected: boolean,
    isPreview = false,
): void {
    const S = cellSize;
    const x0 = zone.topLeft.col * S;
    const y0 = zone.topLeft.row * S;
    const x1 = (zone.bottomRight.col + 1) * S;
    const y1 = (zone.bottomRight.row + 1) * S;

    ctx.save();
    if (isPreview) ctx.setLineDash([5, 4]);
    ctx.fillStyle = hexToRgba(ZONE_FILL_COLOR, isPreview ? ZONE_FILL_ALPHA * 0.6 : ZONE_FILL_ALPHA);
    ctx.strokeStyle = isSelected ? ZONE_SELECTED_BORDER_COLOR : hexToRgba(ZONE_FILL_COLOR, ZONE_BORDER_ALPHA);
    ctx.lineWidth = isSelected ? 2.5 : 1.5;

    ctx.beginPath();
    if (zone.shape === 'box') {
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
    } else {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        ctx.ellipse(cx, cy, (x1 - x0) / 2, (y1 - y0) / 2, 0, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
    ctx.restore();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TerrainCanvas({ state, actions }: TerrainCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isMouseDown = useRef(false);
    const [dragStart, setDragStart] = useState<{ col: number; row: number } | null>(null);
    const [dragCurrent, setDragCurrent] = useState<{ col: number; row: number } | null>(null);

    // -----------------------------------------------------------------------
    // Rendering
    // -----------------------------------------------------------------------

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !state.segmentData) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const { width, height, terrain, pointsOfInterest, zones } = state.segmentData;
        const S = EDITOR_CELL_SIZE;

        // 1. Terrain fill
        for (let row = 0; row < height; row++) {
            for (let col = 0; col < width; col++) {
                const terrainType = terrain[row][col] as TerrainType;
                ctx.fillStyle = TERRAIN_COLORS[terrainType] ?? '#000';
                ctx.fillRect(col * S, row * S, S, S);
            }
        }

        // 2. Grid lines (faint)
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();

        // Vertical lines
        for (let col = 0; col <= width; col++) {
            ctx.moveTo(col * S + 0.5, 0);
            ctx.lineTo(col * S + 0.5, height * S);
        }
        // Horizontal lines
        for (let row = 0; row <= height; row++) {
            ctx.moveTo(0, row * S + 0.5);
            ctx.lineTo(width * S, row * S + 0.5);
        }
        ctx.stroke();

        // 3. Hover highlight
        if (state.hoveredCell && state.activeTool === 'terrain_paint') {
            const brushCells = getBrushCells(
                state.hoveredCell.col,
                state.hoveredCell.row,
                state.brushSize,
                width,
                height,
            );
            ctx.fillStyle = `rgba(255,255,255,${HOVER_OVERLAY_ALPHA})`;
            for (const { col, row } of brushCells) {
                ctx.fillRect(col * S, row * S, S, S);
            }
        }

        // 4. POI overlay
        if (state.showPOIs && pointsOfInterest.length > 0) {
            for (const poi of pointsOfInterest) {
                const cx = poi.col * S + S / 2;
                const cy = poi.row * S + S / 2;
                const style = POI_STYLES[poi.type ?? 'generic'];

                // Radius ring (drawn first so icon sits on top)
                if (poi.radius != null && poi.radius > 0) {
                    const radiusPx = poi.radius * S;
                    ctx.beginPath();
                    ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
                    ctx.fillStyle = hexToRgba(style.color, POI_RADIUS_ALPHA);
                    ctx.fill();
                    ctx.strokeStyle = hexToRgba(style.color, POI_RADIUS_BORDER_ALPHA);
                    ctx.lineWidth = 1.5;
                    ctx.stroke();
                }

                // Icon
                ctx.fillStyle = style.color;
                ctx.strokeStyle = 'rgba(0,0,0,0.85)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();

                switch (style.shape) {
                    case 'circle': {
                        ctx.arc(cx, cy, 6, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.stroke();
                        break;
                    }
                    case 'diamond': {
                        // Rotated square (diamond), half-size 5
                        const d = 5;
                        ctx.moveTo(cx, cy - d);
                        ctx.lineTo(cx + d, cy);
                        ctx.lineTo(cx, cy + d);
                        ctx.lineTo(cx - d, cy);
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                        break;
                    }
                    case 'square': {
                        // 10×10 square centered at (cx, cy)
                        ctx.rect(cx - 5, cy - 5, 10, 10);
                        ctx.fill();
                        ctx.stroke();
                        break;
                    }
                    case 'triangle': {
                        // Upward-pointing triangle, base 12, height 10
                        ctx.moveTo(cx, cy - 10 * (2 / 3));       // top vertex
                        ctx.lineTo(cx + 6, cy + 10 * (1 / 3));   // bottom-right
                        ctx.lineTo(cx - 6, cy + 10 * (1 / 3));   // bottom-left
                        ctx.closePath();
                        ctx.fill();
                        ctx.stroke();
                        break;
                    }
                }

                // Selection ring
                if (poi.id === state.selectedPOIId) {
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
                    ctx.stroke();
                }
            }
        }

        // 5. Zone overlay
        if (state.showZones && zones.length > 0) {
            for (const zone of zones) {
                drawZone(ctx, zone, S, zone.id === state.selectedZoneId);
            }
        }

        // 6. Live zone-drag preview
        if (state.activeTool === 'zone' && dragStart && dragCurrent) {
            const { topLeft, bottomRight } = normalizeCorners(dragStart, dragCurrent);
            drawZone(ctx, { shape: state.activeZoneShape, topLeft, bottomRight }, S, false, true);
        }
    }, [state, dragStart, dragCurrent]);

    // -----------------------------------------------------------------------
    // Mouse helpers
    // -----------------------------------------------------------------------

    const getCellFromEvent = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>): { col: number; row: number } | null => {
            const segmentData = state.segmentData;
            if (!segmentData) return null;

            const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
            const offsetX = e.clientX - rect.left;
            const offsetY = e.clientY - rect.top;

            const col = Math.floor(offsetX / EDITOR_CELL_SIZE);
            const row = Math.floor(offsetY / EDITOR_CELL_SIZE);

            if (col < 0 || col >= segmentData.width || row < 0 || row >= segmentData.height) {
                return null;
            }
            return { col, row };
        },
        [state.segmentData],
    );

    // -----------------------------------------------------------------------
    // Event handlers
    // -----------------------------------------------------------------------

    const handleMouseMove = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            const cell = getCellFromEvent(e);
            actions.setHoveredCell(cell);

            if (
                isMouseDown.current &&
                state.activeTool === 'terrain_paint' &&
                cell &&
                state.segmentData
            ) {
                const brushCells = getBrushCells(
                    cell.col,
                    cell.row,
                    state.brushSize,
                    state.segmentData.width,
                    state.segmentData.height,
                );
                actions.paintCells(brushCells);
            }

            if (isMouseDown.current && state.activeTool === 'zone' && cell) {
                setDragCurrent(cell);
            }
        },
        [getCellFromEvent, actions, state.activeTool, state.brushSize, state.segmentData],
    );

    const handleMouseDown = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement>) => {
            isMouseDown.current = true;

            const cell = getCellFromEvent(e);
            if (!cell || !state.segmentData) return;

            if (state.activeTool === 'terrain_paint') {
                const brushCells = getBrushCells(
                    cell.col,
                    cell.row,
                    state.brushSize,
                    state.segmentData.width,
                    state.segmentData.height,
                );
                actions.paintCells(brushCells);
                return;
            }

            if (state.activeTool === 'zone') {
                setDragStart(cell);
                setDragCurrent(cell);
                return;
            }

            if (state.activeTool === 'poi') {
                const S = EDITOR_CELL_SIZE;
                const _clickX = cell.col * S + S / 2;
                const _clickY = cell.row * S + S / 2;

                // Convert click to canvas pixel coords for distance check
                const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
                const offsetX = e.clientX - rect.left;
                const offsetY = e.clientY - rect.top;
                const threshold = S * 0.8;

                const nearby = state.segmentData.pointsOfInterest.find((poi: MapSegmentPOI) => {
                    const px = poi.col * S + S / 2;
                    const py = poi.row * S + S / 2;
                    const dx = offsetX - px;
                    const dy = offsetY - py;
                    return Math.sqrt(dx * dx + dy * dy) <= threshold;
                });

                if (nearby) {
                    actions.selectPOI(nearby.id);
                } else {
                    actions.addPOI({
                        label: 'New Point',
                        col: cell.col,
                        row: cell.row,
                        type: 'generic',
                    });
                }
            }
        },
        [getCellFromEvent, actions, state.activeTool, state.brushSize, state.segmentData],
    );

    const handleMouseUp = useCallback(() => {
        isMouseDown.current = false;

        if (state.activeTool === 'zone' && dragStart && dragCurrent) {
            const { topLeft, bottomRight } = normalizeCorners(dragStart, dragCurrent);
            actions.addZone({ shape: state.activeZoneShape, topLeft, bottomRight });
        }
        setDragStart(null);
        setDragCurrent(null);
    }, [state.activeTool, state.activeZoneShape, dragStart, dragCurrent, actions]);

    const handleMouseLeave = useCallback(() => {
        isMouseDown.current = false;
        actions.setHoveredCell(null);
        setDragStart(null);
        setDragCurrent(null);
    }, [actions]);

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    if (!state.segmentData) {
        return (
            <div className="flex items-center justify-center h-64 text-muted">
                No segment loaded
            </div>
        );
    }

    const cursorClass =
        state.activeTool === 'poi' ? 'cursor-pointer' : 'cursor-crosshair';

    return (
        <canvas
            ref={canvasRef}
            width={state.segmentData.width * EDITOR_CELL_SIZE}
            height={state.segmentData.height * EDITOR_CELL_SIZE}
            className={cursorClass}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
        />
    );
}
