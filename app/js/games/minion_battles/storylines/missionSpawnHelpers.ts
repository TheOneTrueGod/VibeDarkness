/**
 * Mission spawn utilities - deterministic-but-scattered placement for pre-placed enemies.
 */

import type { GameEngine } from '../game/GameEngine';
import { CELL_SIZE } from '../terrain/TerrainGrid';

const MIN_SEPARATION_PX = CELL_SIZE;
const PLACEMENT_ATTEMPTS = 20;

/**
 * Scatters `count` world positions inside a circle (radius in tiles), using the engine's
 * seeded RNG so every client computes the same layout. Not terrain-aware — only use this
 * for target circles known to be open, passable ground.
 */
export function scatterPositionsInCircle(
    engine: GameEngine,
    target: { x: number; y: number; radius: number },
    count: number,
): { x: number; y: number }[] {
    const radiusPx = target.radius * CELL_SIZE;
    const positions: { x: number; y: number }[] = [];

    for (let i = 0; i < count; i++) {
        let candidate = { x: target.x, y: target.y };
        for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
            const angle = (engine.generateRandomInteger(0, 359) * Math.PI) / 180;
            const r = radiusPx * Math.sqrt(engine.generateRandomInteger(0, 1000) / 1000);
            candidate = { x: target.x + Math.cos(angle) * r, y: target.y + Math.sin(angle) * r };
            const tooClose = positions.some((p) => {
                const dx = p.x - candidate.x;
                const dy = p.y - candidate.y;
                return dx * dx + dy * dy < MIN_SEPARATION_PX * MIN_SEPARATION_PX;
            });
            if (!tooClose) break;
        }
        positions.push(candidate);
    }

    return positions;
}
