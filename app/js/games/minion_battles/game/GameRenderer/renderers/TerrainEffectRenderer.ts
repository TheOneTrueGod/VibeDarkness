import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { rasterizeArea } from '../../TerrainLayerManager';
import type { GameEngine } from '../../GameEngine';
import { TERRAIN_EFFECT_VISUAL_DEFS } from '../terrainEffectDefs';

const Z_TERRAIN_EFFECTS = 10.5;

export class TerrainEffectRenderer {
    private terrainEffectsContainer: Container = new Container();
    private effectVisuals: Map<string, Container> = new Map();
    private textureCache: Map<string, Texture> = new Map();
    private pendingLoads: Map<string, Promise<Texture>> = new Map();

    constructor(private readonly gameContainer: Container) {
        this.terrainEffectsContainer.zIndex = Z_TERRAIN_EFFECTS;
        this.gameContainer.addChild(this.terrainEffectsContainer);
    }

    render(engine: GameEngine): void {
        const activeEffects = engine.terrainLayers.allEffects;
        const activeIds = new Set<string>();

        for (const [id, record] of activeEffects) {
            const def = TERRAIN_EFFECT_VISUAL_DEFS[record.effectType];
            if (!def) continue;
            activeIds.add(id);

            if (this.effectVisuals.has(id)) continue;

            const texture = this.textureCache.get(record.effectType);
            if (texture) {
                this.createEffectVisual(id, record, def.layer, texture);
            } else if (!this.pendingLoads.has(record.effectType)) {
                const dataUrl = 'data:image/svg+xml;base64,' + btoa(def.svgString);
                const load = (Assets.load(dataUrl) as Promise<Texture>).then((tex) => {
                    this.textureCache.set(record.effectType, tex);
                    this.pendingLoads.delete(record.effectType);
                    return tex;
                });
                this.pendingLoads.set(record.effectType, load);
            }
        }

        for (const [id, visual] of this.effectVisuals) {
            if (!activeIds.has(id)) {
                this.terrainEffectsContainer.removeChild(visual);
                visual.destroy();
                this.effectVisuals.delete(id);
            }
        }
    }

    private createEffectVisual(
        id: string,
        record: import('../../TerrainLayerManager').TerrainEffectRecord,
        layer: 'ground' | 'air',
        texture: Texture,
    ): void {
        const cells = rasterizeArea(record.area);
        if (cells.length === 0) return;

        const container = new Container();
        const yOffset = layer === 'ground' ? CELL_SIZE * 0.75 : CELL_SIZE * 0.25;

        for (const { col, row } of cells) {
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5, 0.5);
            sprite.width = CELL_SIZE;
            sprite.height = CELL_SIZE / 2;
            sprite.x = col * CELL_SIZE + CELL_SIZE / 2;
            sprite.y = row * CELL_SIZE + yOffset;
            container.addChild(sprite);
        }

        this.effectVisuals.set(id, container);
        this.terrainEffectsContainer.addChild(container);
    }

    destroy(): void {
        for (const visual of this.effectVisuals.values()) visual.destroy();
        this.effectVisuals.clear();
        this.terrainEffectsContainer.destroy();
    }
}
