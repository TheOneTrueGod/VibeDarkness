import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { DAMAGE_TIER_NONE, getDamageTier } from '../../../terrain/FloorTile';
import { DEFAULT_ROCK_DESTRUCTIBLE_KIND } from '../../../card_defs/05_earth_core/earthCoreConstants';
import type { GameEngine } from '../../GameEngine';
import { ROCK_FLOOR_VISUAL_TIERS, RUBBLE_FLOOR_VISUAL } from '../floorTileVisualDefs';

const Z_FLOOR_TILES = 5;

function cellKey(col: number, row: number): string {
    return `${col},${row}`;
}

function visualCacheKey(col: number, row: number, terrainType: TerrainType, tier: number): string {
    return `${col},${row}:${terrainType}:${tier}`;
}

export class FloorTileRenderer {
    private floorTilesContainer: Container = new Container();
    private cellVisuals: Map<string, Container> = new Map();
    private textureCache: Map<string, Texture> = new Map();
    private pendingLoads: Map<string, Promise<Texture>> = new Map();

    constructor(private readonly gameContainer: Container) {
        this.floorTilesContainer.zIndex = Z_FLOOR_TILES;
        this.gameContainer.addChild(this.floorTilesContainer);
    }

    render(engine: GameEngine): void {
        const entries = engine.terrainLayers.getFloorTileEntries();
        const activeKeys = new Set<string>();

        for (const { col, row, tile } of entries) {
            if (tile.terrainType === TerrainType.Rubble) {
                const key = cellKey(col, row);
                activeKeys.add(key);
                const cacheKey = visualCacheKey(col, row, TerrainType.Rubble, 0);
                this.ensureCellVisual(key, col, row, cacheKey, RUBBLE_FLOOR_VISUAL.svgString);
                continue;
            }

            if (tile.terrainType !== TerrainType.Rock) continue;
            if (tile.destructible?.kind !== DEFAULT_ROCK_DESTRUCTIBLE_KIND) continue;

            const tier = getDamageTier(tile.destructible);
            const key = cellKey(col, row);
            if (tier === DAMAGE_TIER_NONE) continue;
            activeKeys.add(key);
            const tierDef = ROCK_FLOOR_VISUAL_TIERS[tier - 1];
            if (!tierDef) continue;
            const cacheKey = visualCacheKey(col, row, TerrainType.Rock, tier);
            this.ensureCellVisual(key, col, row, cacheKey, tierDef.svgString);
        }

        for (const [key, visual] of this.cellVisuals) {
            if (!activeKeys.has(key)) {
                this.floorTilesContainer.removeChild(visual);
                visual.destroy();
                this.cellVisuals.delete(key);
            }
        }
    }

    private ensureCellVisual(
        cellKeyStr: string,
        col: number,
        row: number,
        textureKey: string,
        svgString: string,
    ): void {
        const existing = this.cellVisuals.get(cellKeyStr);
        if (existing && existing.label === textureKey) return;

        if (existing) {
            this.floorTilesContainer.removeChild(existing);
            existing.destroy();
            this.cellVisuals.delete(cellKeyStr);
        }

        const texture = this.textureCache.get(textureKey);
        if (texture) {
            this.createCellVisual(cellKeyStr, col, row, textureKey, texture);
        } else if (!this.pendingLoads.has(textureKey)) {
            const dataUrl = 'data:image/svg+xml;base64,' + btoa(svgString);
            const load = (Assets.load(dataUrl) as Promise<Texture>).then((tex) => {
                this.textureCache.set(textureKey, tex);
                this.pendingLoads.delete(textureKey);
                if (!this.cellVisuals.has(cellKeyStr)) {
                    this.createCellVisual(cellKeyStr, col, row, textureKey, tex);
                }
                return tex;
            });
            this.pendingLoads.set(textureKey, load);
        }
    }

    private createCellVisual(
        cellKeyStr: string,
        col: number,
        row: number,
        textureKey: string,
        texture: Texture,
    ): void {
        const container = new Container();
        container.label = textureKey;
        const sprite = new Sprite(texture);
        sprite.anchor.set(0, 0);
        sprite.width = CELL_SIZE;
        sprite.height = CELL_SIZE;
        sprite.x = col * CELL_SIZE;
        sprite.y = row * CELL_SIZE;
        container.addChild(sprite);
        this.cellVisuals.set(cellKeyStr, container);
        this.floorTilesContainer.addChild(container);
    }

    destroy(): void {
        for (const visual of this.cellVisuals.values()) visual.destroy();
        this.cellVisuals.clear();
        this.floorTilesContainer.destroy();
    }
}
