import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { rasterizeArea, type TerrainEffectRecord } from '../../TerrainLayerManager';
import type { GameEngine } from '../../GameEngine';
import { TERRAIN_EFFECT_VISUAL_DEFS, type TerrainEffectVisualDef } from '../terrainEffectDefs';
import { getThornWearStage } from '../../terrainEffects/terrainEffectDefs';

const Z_TERRAIN_EFFECTS = 10.5;

interface EffectVisual {
    recordId: string;
    effectType: string;
    container: Container;
    /** Each sprite with its full-size (scale 1) sprite scale, so fades can scale per cell in place. */
    sprites: Array<{ sprite: Sprite; baseScaleX: number; baseScaleY: number }>;
    /** Current visual scale / alpha multipliers (1 = as defined). */
    scale: number;
    alpha: number;
}

interface ExitingVisual {
    visual: EffectVisual;
    exit: NonNullable<TerrainEffectVisualDef['exit']>;
    elapsedSec: number;
    fromScale: number;
    fromAlpha: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export class TerrainEffectRenderer {
    private terrainEffectsContainer: Container = new Container();
    private effectVisuals: Map<string, EffectVisual> = new Map();
    private exitingVisuals: ExitingVisual[] = [];
    /** Per effect type: the untouched texture, then one per worn look (`wornSvgStrings`). */
    private textureCache: Map<string, Texture[]> = new Map();
    private pendingLoads: Map<string, Promise<Texture[]>> = new Map();

    constructor(private readonly gameContainer: Container) {
        this.terrainEffectsContainer.zIndex = Z_TERRAIN_EFFECTS;
        this.gameContainer.addChild(this.terrainEffectsContainer);
    }

    setLayerVisible(visible: boolean): void {
        this.terrainEffectsContainer.visible = visible;
    }

    /** `realDt` is wall-clock seconds since the last frame; it drives exit animations even while paused. */
    render(engine: GameEngine, realDt = 0): void {
        const activeEffects = engine.terrainLayers.allEffects;
        const activeIds = new Set<string>();

        for (const [id, record] of activeEffects) {
            const def = TERRAIN_EFFECT_VISUAL_DEFS[record.effectType];
            if (!def) continue;
            // Key by revision (carved records) and wear stage (worn thorns), so stale sprites are rebuilt.
            const wornCount = def.wornSvgStrings?.length ?? 0;
            const stage = wornCount > 0 ? getThornWearStage(record, wornCount) : 0;
            const visualKey = `${id}@${record.revision ?? 0}#${stage}`;
            activeIds.add(visualKey);

            const existing = this.effectVisuals.get(visualKey);
            if (existing) {
                this.applyLifetimeFade(existing, record, def, engine.gameTime);
                continue;
            }

            const texture = this.textureCache.get(record.effectType)?.[stage];
            if (texture) {
                const visual = this.createEffectVisual(id, record, def, texture);
                if (visual) {
                    this.effectVisuals.set(visualKey, visual);
                    this.applyLifetimeFade(visual, record, def, engine.gameTime);
                }
            } else if (!this.pendingLoads.has(record.effectType)) {
                // Every stage loads together, so a worn swap never waits on a texture.
                const svgs = [def.svgString, ...(def.wornSvgStrings ?? [])];
                const load = Promise.all(
                    svgs.map((svg) => Assets.load('data:image/svg+xml;base64,' + btoa(svg)) as Promise<Texture>),
                ).then((textures) => {
                    this.textureCache.set(record.effectType, textures);
                    this.pendingLoads.delete(record.effectType);
                    return textures;
                });
                this.pendingLoads.set(record.effectType, load);
            }
        }

        for (const [key, visual] of this.effectVisuals) {
            if (activeIds.has(key)) continue;
            this.effectVisuals.delete(key);
            const exit = TERRAIN_EFFECT_VISUAL_DEFS[visual.effectType]?.exit;
            // A revision or wear bump (record still alive) is a rebuild, not a removal: swap instantly.
            if (exit && !activeEffects.has(visual.recordId)) {
                this.exitingVisuals.push({ visual, exit, elapsedSec: 0, fromScale: visual.scale, fromAlpha: visual.alpha });
            } else {
                this.destroyVisual(visual);
            }
        }

        this.advanceExits(realDt);
    }

    /** Scale / fade a timed effect toward its def's `lifetimeFade` targets as it nears expiry. */
    private applyLifetimeFade(
        visual: EffectVisual,
        record: TerrainEffectRecord,
        def: TerrainEffectVisualDef,
        gameTime: number,
    ): void {
        const fade = def.lifetimeFade;
        if (!fade || record.expiresAtGameTime === undefined) return;
        const lifetime = record.expiresAtGameTime - record.placedAtGameTime;
        const t = lifetime > 0 ? Math.min(1, Math.max(0, (gameTime - record.placedAtGameTime) / lifetime)) : 1;
        this.setVisualTransform(visual, lerp(1, fade.endScale, t), lerp(1, fade.endAlpha, t));
    }

    private advanceExits(realDt: number): void {
        if (this.exitingVisuals.length === 0) return;
        const stillExiting: ExitingVisual[] = [];
        for (const exiting of this.exitingVisuals) {
            exiting.elapsedSec += realDt;
            const { exit } = exiting;
            const t = exit.durationSec > 0 ? Math.min(1, exiting.elapsedSec / exit.durationSec) : 1;
            if (t >= 1) {
                this.destroyVisual(exiting.visual);
                continue;
            }
            const eased = 1 - (1 - t) * (1 - t); // ease-out: snappy start, soft finish
            this.setVisualTransform(
                exiting.visual,
                lerp(exiting.fromScale, exit.endScale, eased),
                lerp(exiting.fromAlpha, exit.endAlpha, eased),
            );
            stillExiting.push(exiting);
        }
        this.exitingVisuals = stillExiting;
    }

    private setVisualTransform(visual: EffectVisual, scale: number, alpha: number): void {
        if (visual.scale !== scale) {
            visual.scale = scale;
            for (const { sprite, baseScaleX, baseScaleY } of visual.sprites) {
                sprite.scale.set(baseScaleX * scale, baseScaleY * scale);
            }
        }
        visual.alpha = alpha;
        visual.container.alpha = alpha;
    }

    private createEffectVisual(
        recordId: string,
        record: TerrainEffectRecord,
        def: TerrainEffectVisualDef,
        texture: Texture,
    ): EffectVisual | null {
        const cells = rasterizeArea(record.area);
        if (cells.length === 0) return null;

        const container = new Container();
        const fullCell = def.footprint === 'fullCell';
        const yOffset = fullCell ? CELL_SIZE * 0.5 : def.layer === 'ground' ? CELL_SIZE * 0.75 : CELL_SIZE * 0.25;
        const sprites: EffectVisual['sprites'] = [];

        for (const { col, row } of cells) {
            const sprite = new Sprite(texture);
            sprite.anchor.set(0.5, 0.5);
            sprite.width = CELL_SIZE;
            sprite.height = fullCell ? CELL_SIZE : CELL_SIZE / 2;
            sprite.x = col * CELL_SIZE + CELL_SIZE / 2;
            sprite.y = row * CELL_SIZE + yOffset;
            container.addChild(sprite);
            sprites.push({ sprite, baseScaleX: sprite.scale.x, baseScaleY: sprite.scale.y });
        }

        this.terrainEffectsContainer.addChild(container);
        return { recordId, effectType: record.effectType, container, sprites, scale: 1, alpha: 1 };
    }

    private destroyVisual(visual: EffectVisual): void {
        this.terrainEffectsContainer.removeChild(visual.container);
        visual.container.destroy();
    }

    destroy(): void {
        for (const visual of this.effectVisuals.values()) visual.container.destroy();
        for (const { visual } of this.exitingVisuals) visual.container.destroy();
        this.effectVisuals.clear();
        this.exitingVisuals = [];
        this.terrainEffectsContainer.destroy();
    }
}
