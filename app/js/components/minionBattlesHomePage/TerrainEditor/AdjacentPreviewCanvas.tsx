import React, { useRef, useEffect } from 'react';
import { MapSegmentData } from '../../../games/minion_battles/terrain/segmentSchema';
import { TERRAIN_COLORS, EDITOR_CELL_SIZE } from './terrainEditorColors';
import { TerrainType } from '../../../games/minion_battles/terrain/TerrainType';

const PREVIEW_DEPTH = 2;
const PREVIEW_OVERLAY_ALPHA = 0.35;

interface Props {
    segment: MapSegmentData | null;
    direction: 'north' | 'south' | 'east' | 'west';
    mainWidth: number;
    mainHeight: number;
    onClick: (() => void) | null;
    onCreateMap?: () => void;
    icon: React.ReactNode;
}

export default function AdjacentPreviewCanvas({
    segment,
    direction,
    mainWidth,
    mainHeight,
    onClick,
    onCreateMap,
    icon,
}: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const S = EDITOR_CELL_SIZE;
    const depth = PREVIEW_DEPTH;
    const isNS = direction === 'north' || direction === 'south';

    // Canvas is sized to fit the grid cell — always based on main segment dimensions.
    const canvasW = isNS ? mainWidth * S : depth * S;
    const canvasH = isNS ? depth * S : mainHeight * S;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.clearRect(0, 0, canvasW, canvasH);

        if (!segment) {
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.fillRect(0, 0, canvasW, canvasH);
            return;
        }

        const { terrain, width, height } = segment;

        // Determine the slice of the adjacent segment to draw.
        let startCol = 0, endCol = depth, startRow = 0, endRow = depth;
        if (direction === 'north') { startRow = height - depth; endRow = height; endCol = width; }
        else if (direction === 'south') { endRow = depth; endCol = width; }
        else if (direction === 'west') { startCol = width - depth; endCol = width; endRow = height; }
        else /* east */ { endCol = depth; endRow = height; }

        // Offset so the slice starts at canvas (0, 0).
        const offsetX = -startCol * S;
        const offsetY = -startRow * S;

        for (let row = startRow; row < endRow; row++) {
            for (let col = startCol; col < endCol; col++) {
                ctx.fillStyle = TERRAIN_COLORS[terrain[row][col] as TerrainType] ?? '#000';
                ctx.fillRect(col * S + offsetX, row * S + offsetY, S, S);
            }
        }

        // Grid lines
        const drawW = (endCol - startCol) * S;
        const drawH = (endRow - startRow) * S;
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let c = 0; c <= endCol - startCol; c++) {
            ctx.moveTo(c * S + 0.5, 0);
            ctx.lineTo(c * S + 0.5, drawH);
        }
        for (let r = 0; r <= endRow - startRow; r++) {
            ctx.moveTo(0, r * S + 0.5);
            ctx.lineTo(drawW, r * S + 0.5);
        }
        ctx.stroke();

        // White overlay
        ctx.fillStyle = `rgba(255,255,255,${PREVIEW_OVERLAY_ALPHA})`;
        ctx.fillRect(0, 0, canvasW, canvasH);
    }, [segment, direction, canvasW, canvasH, S, depth]);

    const isInteractive = !!(onClick || (!segment && onCreateMap));

    return (
        <div
            className={`relative flex items-center justify-center transition-opacity ${
                isInteractive ? 'cursor-pointer hover:opacity-75' : 'opacity-25 cursor-default'
            }`}
            style={{ width: canvasW, height: canvasH }}
            onClick={onClick ?? (!segment ? onCreateMap : undefined) ?? undefined}
        >
            <canvas ref={canvasRef} width={canvasW} height={canvasH} className="absolute inset-0" />
            {!segment && onCreateMap && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-white/30 text-xs font-bold tracking-widest">CREATE</span>
                </div>
            )}
            {isInteractive && (
                <div className="relative z-10 text-white" style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.8))' }}>
                    {icon}
                </div>
            )}
        </div>
    );
}
