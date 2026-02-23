/**
 * Edge spawn utilities - place units spread around the map perimeter.
 */

import { WORLD_WIDTH, WORLD_HEIGHT } from '../engine/GameEngine';

const PADDING = 40;

/**
 * Return N positions evenly spread along the map edges (top, right, bottom, left).
 * Units are placed inset from corners to avoid overlap.
 */
export function getEdgePositions(count: number): { x: number; y: number }[] {
    if (count <= 0) return [];

    const positions: { x: number; y: number }[] = [];
    const innerW = WORLD_WIDTH - PADDING * 2;
    const innerH = WORLD_HEIGHT - PADDING * 2;
    const perimeter = 2 * innerW + 2 * innerH;

    for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const dist = t * perimeter;

        let x: number;
        let y: number;

        if (dist < innerW) {
            x = PADDING + dist;
            y = PADDING;
        } else if (dist < innerW + innerH) {
            x = PADDING + innerW;
            y = PADDING + (dist - innerW);
        } else if (dist < innerW * 2 + innerH) {
            x = PADDING + innerW - (dist - innerW - innerH);
            y = PADDING + innerH;
        } else {
            x = PADDING;
            y = PADDING + innerH - (dist - innerW * 2 - innerH);
        }

        positions.push({ x, y });
    }

    return positions;
}
