import { Container, Sprite } from 'pixi.js';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import type { GameEngine } from '../../GameEngine';
import type { AssetRegistry } from '../AssetRegistry';

/** Above the darkness overlay (5) so hints stay readable, below special tiles (6) and units. */
const Z_OBJECTIVE_TILES = 5.5;

/** Footprint fills this fraction of the tile. */
const ICON_SCALE = 0.8;

/** Footprints tilt at most this far (either direction) from the icon's default orientation. */
export const OBJECTIVE_TILE_MAX_TILT_RAD = (15 * Math.PI) / 180;

/**
 * Deterministic tilt in [-15°, +15°] from tile coords — no RNG draws, so it can never desync
 * the sim and every client sees the same layout.
 */
export function objectiveTileRotation(col: number, row: number): number {
    let h = Math.imul(col + 1, 374761393) ^ Math.imul(row + 1, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (((h >>> 0) / 0xffffffff) * 2 - 1) * OBJECTIVE_TILE_MAX_TILT_RAD;
}

export class ObjectiveTileRenderer {
    private container: Container = new Container();
    private visuals: Map<string, Sprite> = new Map();

    constructor(
        private readonly gameContainer: Container,
        private readonly assets: AssetRegistry,
    ) {
        this.container.zIndex = Z_OBJECTIVE_TILES;
        this.gameContainer.addChild(this.container);
    }

    render(engine: GameEngine): void {
        const active = new Set<string>();
        for (const marker of engine.getObjectiveTileMarkers()) {
            const texture = this.assets.getEffectTexture(marker.image);
            if (!texture) continue;
            for (const { col, row } of marker.tiles) {
                const key = `${marker.id}:${col},${row}`;
                active.add(key);
                let sprite = this.visuals.get(key);
                if (!sprite) {
                    sprite = new Sprite(texture);
                    sprite.anchor.set(0.5);
                    sprite.width = CELL_SIZE * ICON_SCALE;
                    sprite.height = CELL_SIZE * ICON_SCALE;
                    sprite.x = col * CELL_SIZE + CELL_SIZE / 2;
                    sprite.y = row * CELL_SIZE + CELL_SIZE / 2;
                    sprite.rotation = objectiveTileRotation(col, row);
                    sprite.alpha = marker.alpha;
                    this.visuals.set(key, sprite);
                    this.container.addChild(sprite);
                }
            }
        }

        for (const [key, sprite] of this.visuals) {
            if (!active.has(key)) {
                this.container.removeChild(sprite);
                sprite.destroy();
                this.visuals.delete(key);
            }
        }
    }

    destroy(): void {
        this.visuals.clear();
        this.container.destroy({ children: true });
    }
}
