/**
 * GameRenderer - Bridges the game engine state to PixiJS visuals.
 *
 * Maintains a PixiJS Application and a map of visual containers for
 * each game object. Each render tick syncs sprite positions from
 * engine objects with camera offsets applied.
 */

import { Application, Assets, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { WAIT_FOR_ALL_ASSETS_TO_LOAD_BEFORE_GAME_START } from '../../../gameConstants';
import type { GameEngine } from './GameEngine';
import type { Camera } from './Camera';
import type { Unit } from './units/Unit';
import { getAbility } from '../abilities/AbilityRegistry';
import { Projectile } from './projectiles/Projectile';
import type { Effect } from './effects/Effect';
import { areEnemies } from './teams';
import type { TeamId } from './teams';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainRenderer } from '../terrain/TerrainRenderer';
import {
    renderUnit,
    updateUnitHpBar,
    getBodyColor,
    syncUnitCharacterSpriteIfNeeded,
    type IUnitRenderContext,
} from './units/unit_defs/unitDef';
import { getBuffVisualRenderer } from '../buffs/buffVisuals';
import { createEffectVisual, updateEffectVisual, type IEffectRenderContext } from './effectDef';
import { EFFECT_IMAGE_SOURCES, type EffectImageKey } from './effectImages';
import { getSpecialTileDef } from '../storylines/specialTileDefs';
import type { SpecialTile } from './specialTiles/SpecialTile';
import { getLightGrid, clearLightGridCache, type LightSource } from './LightGrid';
import type { DamageTakenEvent } from './EventBus';
import { debugSettingsSnapshot } from '../../../debug/debugSettingsStore';

/** Hit flash duration in seconds (real time, not affected by pause). */
const HIT_FLASH_DURATION = 0.3;

/** Color for move target markers (dark gray so visible in darkness). */
const MOVE_TARGET_COLOR = 0x333333;

/** Light background stroke for move target paths for readability on all terrain. */
const MOVE_TARGET_PATH_BG_COLOR = 0xffffff;

/** Z-index constants for game container layers (lower = behind). */
const Z_INDEX = {
    terrain: 0,
    crystalAura: 2,
    darkness: 5,
    specialTiles: 6,
    moveTargets: 7,
    units: 10,
    projectiles: 11,
    effects: 12,
    abilityPreview: 100,
    targetingPreview: 101,
} as const;

/** Ranged enemy character sprite (slime): displayed slightly smaller than the unit hitbox circle. */
const SLIME_SVG_URL = new URL('../assets/characters/slime.svg', import.meta.url).href;
/** Melee enemy character sprite (swordwoman). */
const SWORDWOMAN_SVG_URL = new URL('../assets/characters/swordwoman.svg', import.meta.url).href;
/** Wolf (dark_wolf) character sprite (wolf head). */
const WOLF_HEAD_SVG_URL = new URL('../assets/characters/dark_animals/wolf-head.svg', import.meta.url).href;
/** Alpha Wolf boss character sprite (wolf howl). */
const WOLF_HOWL_SVG_URL = new URL('../assets/characters/dark_animals/wolf-howl.svg', import.meta.url).href;
/** Boar character sprite. */
const BOAR_SVG_URL = new URL('../assets/characters/dark_animals/boar.svg', import.meta.url).href;

export class GameRenderer {
    app: Application;
    private gameContainer: Container;
    private unitVisuals: Map<string, Container> = new Map();
    private moveTargetVisuals: Map<string, Graphics> = new Map();
    private projectileVisuals: Map<string, Graphics> = new Map();
    private effectVisuals: Map<string, Container> = new Map();
    private abilityPreviewGraphics: Graphics = new Graphics();
    private targetingPreviewGraphics: Graphics = new Graphics();
    private initialized: boolean = false;
    /** Deduplicates concurrent `init` (e.g. React Strict Mode). */
    private initInFlight: Promise<void> | null = null;

    /** Optional debug: draw a yellow outline around this unit. */
    private debugUnitOutlineId: string | null = null;

    /** The team ID used to determine friend/foe glow colors. */
    localTeamId: TeamId = 'player';

    /** Terrain renderer (builds and caches the terrain sprite). */
    private terrainRenderer: TerrainRenderer = new TerrainRenderer();
    private terrainSprite: Sprite | null = null;
    private pendingTerrainGrid: TerrainGrid | null = null;
    /** Container for special tiles (above terrain, below units). */
    private specialTilesContainer: Container = new Container();
    private specialTileVisuals: Map<string, Container> = new Map();
    /** Soft blue overlay on tiles in crystal light radius (10% opacity). */
    private crystalAuraGraphics: Graphics = new Graphics();
    /** Purple overlay on tiles in dark crystal filter radius (arena effect). */
    private darkCrystalAuraGraphics: Graphics = new Graphics();

    /** Cached texture for ranged enemy (slime) character sprite. */
    private slimeTexture: Texture | null = null;
    /** Cached texture for melee enemy (swordwoman) character sprite. */
    private swordwomanTexture: Texture | null = null;
    /** After deferred asset load, re-apply textures to unit visuals that were created with letter fallbacks. */
    private pendingUnitCharacterSpriteSync: boolean = false;

    /** Cached texture for dark_wolf (wolf head) character sprite. */
    private wolfHeadTexture: Texture | null = null;
    /** Cached texture for alpha_wolf (wolf howl) character sprite. */
    private wolfHowlTexture: Texture | null = null;
    /** Cached texture for boar character sprite. */
    private boarTexture: Texture | null = null;
    /** Cached texture for Campfire. */
    private campfireTexture: Texture | null = null;

    /** Cached textures for effect sprites (ParticleImage, etc.). */
    private effectTextures: Partial<Record<EffectImageKey, Texture>> = {};

    /** Mission light config. Defaults: enabled true, global 0. */
    private lightLevelEnabled: boolean = true;
    private globalLightLevel: number = 0;
    /** Darkness overlay (above terrain, below special tiles). Only visible when light enabled. */
    private darknessOverlaySprite: Sprite | null = null;
    /** Full overlay cache key (sources + globalLightLevel + size); when it changes we redraw. */
    private lastOverlayKey: string | null = null;
    /** Current light grid [row][col], for unit visibility. Set when light enabled. */
    private currentLightGrid: number[][] | null = null;

    /** Engine ref for damage_taken handler (set each render). */
    private currentEngine: GameEngine | null = null;
    /** Engine whose eventBus is subscribed to `damage_taken` (must rebind when the engine instance changes). */
    private eventBusSource: GameEngine | null = null;
    private readonly damageTakenBound = (data: DamageTakenEvent) => this.onDamageTaken(data);
    /** Active hit flashes: unitId -> { startTime (ms), rafId }. Animation uses real time so it is not paused. */
    private hitFlashState: Map<string, { startTime: number; rafId: number }> = new Map();

    constructor() {
        this.app = new Application();
        this.gameContainer = new Container();
    }

    /** Set the debug unit outline target (or null to clear). */
    setDebugUnitOutline(unitId: string | null): void {
        this.debugUnitOutlineId = unitId;
    }

    /** True after `init` completes successfully (Pixi app is bound to a canvas). */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * When {@link WAIT_FOR_ALL_ASSETS_TO_LOAD_BEFORE_GAME_START} is true, waits for any in-flight `init`
     * (including battle asset loading) before the battle canvas starts rendering. No-op when the flag is false.
     */
    async waitUntilBattleAssetGateForCanvas(): Promise<void> {
        if (!WAIT_FOR_ALL_ASSETS_TO_LOAD_BEFORE_GAME_START) return;
        if (this.initInFlight) await this.initInFlight;
    }

    /**
     * Detach from an engine before it is destroyed or replaced. Clears hit flashes and darkness overlay cache.
     * Safe to call with an engine this renderer was never bound to.
     */
    unbindFromEngine(engine: GameEngine | null | undefined): void {
        if (!engine || this.eventBusSource !== engine) return;
        engine.eventBus.off('damage_taken', this.damageTakenBound);
        this.eventBusSource = null;
        this.clearHitFlashes();
        this.lastOverlayKey = null;
        this.currentLightGrid = null;
    }

    private clearHitFlashes(): void {
        for (const [, s] of this.hitFlashState) {
            cancelAnimationFrame(s.rafId);
        }
        this.hitFlashState.clear();
    }

    async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
        if (this.initialized) {
            this.resize(width, height);
            return;
        }
        if (this.initInFlight) {
            await this.initInFlight;
            this.resize(width, height);
            return;
        }
        this.initInFlight = this.performCanvasInit(canvas, width, height).finally(() => {
            this.initInFlight = null;
        });
        try {
            await this.initInFlight;
        } finally {
            this.resize(width, height);
        }
    }

    private async performCanvasInit(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
        await this.app.init({
            canvas,
            width,
            height,
            backgroundColor: 0x1a1a2e,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
        });
        this.app.stage.addChild(this.gameContainer);
        this.gameContainer.sortableChildren = true;
        this.abilityPreviewGraphics.zIndex = Z_INDEX.abilityPreview;
        this.gameContainer.addChild(this.abilityPreviewGraphics);
        this.targetingPreviewGraphics.zIndex = Z_INDEX.targetingPreview;
        this.gameContainer.addChild(this.targetingPreviewGraphics);

        if (WAIT_FOR_ALL_ASSETS_TO_LOAD_BEFORE_GAME_START) {
            await this.loadBattleAssets();
        } else {
            void this.loadBattleAssets();
        }

        this.initialized = true;

        // Build terrain sprite if it was queued before init completed
        if (this.pendingTerrainGrid) {
            this.buildTerrainSprite(this.pendingTerrainGrid);
            this.pendingTerrainGrid = null;
        }
    }

    /** Loads character SVGs, campfire, and effect textures. Logs failures (non-fatal). */
    private async loadBattleAssets(): Promise<void> {
        const load = async (label: string, url: string, assign: (t: Texture) => void): Promise<void> => {
            try {
                assign((await Assets.load(url)) as Texture);
            } catch (err) {
                console.warn('[GameRenderer] Failed to load battle asset:', label, err);
            }
        };

        await load('enemy_ranged (slime SVG)', SLIME_SVG_URL, (t) => {
            this.slimeTexture = t;
        });
        await load('enemy_melee (swordwoman SVG)', SWORDWOMAN_SVG_URL, (t) => {
            this.swordwomanTexture = t;
        });
        await load('dark_wolf (wolf-head SVG)', WOLF_HEAD_SVG_URL, (t) => {
            this.wolfHeadTexture = t;
        });
        await load('alpha_wolf (wolf-howl SVG)', WOLF_HOWL_SVG_URL, (t) => {
            this.wolfHowlTexture = t;
        });
        await load('boar SVG', BOAR_SVG_URL, (t) => {
            this.boarTexture = t;
        });

        const campfireDef = getSpecialTileDef('Campfire');
        if (campfireDef?.image) {
            await load('Campfire tile', campfireDef.image, (t) => {
                this.campfireTexture = t;
            });
        }

        for (const [key, src] of Object.entries(EFFECT_IMAGE_SOURCES) as [EffectImageKey, string][]) {
            try {
                this.effectTextures[key] = (await Assets.load(src)) as Texture;
            } catch (err) {
                console.warn('[GameRenderer] Failed to load effect texture:', key, src, err);
            }
        }

        this.pendingUnitCharacterSpriteSync = true;
    }

    /**
     * Set the terrain to render. If the renderer is already initialized,
     * builds the sprite immediately; otherwise queues it for after init.
     */
    setTerrain(terrainGrid: TerrainGrid): void {
        if (this.initialized) {
            this.buildTerrainSprite(terrainGrid);
        } else {
            this.pendingTerrainGrid = terrainGrid;
        }
    }

    /** Set mission light config. Defaults: enabled true, global 0. */
    setMissionLightConfig(lightLevelEnabled: boolean, globalLightLevel: number): void {
        this.lightLevelEnabled = lightLevelEnabled;
        this.globalLightLevel = globalLightLevel;
    }

    /** Build the cached terrain sprite and add it at the bottom of the scene. */
    private buildTerrainSprite(terrainGrid: TerrainGrid): void {
        if (this.terrainSprite) {
            this.gameContainer.removeChild(this.terrainSprite);
        }

        this.terrainSprite = this.terrainRenderer.buildSprite(terrainGrid);
        this.terrainSprite.zIndex = 0;
        // Insert terrain at the very bottom of the game container
        this.gameContainer.addChildAt(this.terrainSprite, 0);

        // Darkness overlay (index 1): above terrain, below special tiles and previews
        if (!this.darknessOverlaySprite) {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            this.darknessOverlaySprite = new Sprite(Texture.from({ resource: canvas, label: 'darkness-overlay' }));
            this.darknessOverlaySprite.label = 'darknessOverlay';
        }
        this.darknessOverlaySprite.zIndex = Z_INDEX.darkness;
        if (!this.darknessOverlaySprite.parent) {
            this.gameContainer.addChildAt(this.darknessOverlaySprite, 1);
        }
        this.darknessOverlaySprite.visible = this.lightLevelEnabled;

        // Crystal aura (blue tint on protected tiles) above terrain, below darkness
        this.crystalAuraGraphics.zIndex = Z_INDEX.crystalAura;
        if (!this.crystalAuraGraphics.parent) {
            this.gameContainer.addChildAt(this.crystalAuraGraphics, 1);
        }
        this.darkCrystalAuraGraphics.zIndex = Z_INDEX.crystalAura + 1;
        if (!this.darkCrystalAuraGraphics.parent) {
            this.gameContainer.addChildAt(this.darkCrystalAuraGraphics, 1);
        }
        // Special tiles container above darkness overlay (index 2)
        if (!this.specialTilesContainer.parent) {
            this.gameContainer.addChildAt(this.specialTilesContainer, 2);
        }
        this.specialTilesContainer.zIndex = 6;
    }

    /** Resize the renderer (e.g. on window resize). */
    resize(width: number, height: number): void {
        if (!this.initialized) return;
        this.app.renderer.resize(width, height);
    }

    // ========================================================================
    // Light / darkness overlay
    // ========================================================================

    private static lightLevelToAlpha(level: number): number {
        const L = Math.round(level);
        if (L > 0) return 0;
        if (L > -5) return 0.15;
        if (L > -10) return 0.25;
        if (L > -15) return 0.5;
        if (L > -20) return 0.75;
        return 1;
    }

    private getLightSourcesFromSpecialTiles(specialTiles: SpecialTile[]): LightSource[] {
        const sources: LightSource[] = [];
        for (const tile of specialTiles) {
            if (tile.hp <= 0) continue;
            const light = tile.emitsLight;
            if (light != null && tile.maxHp > 0) {
                // 100% HP => 100% emission; 1% HP => 50% emission; 0% => no light (tile removed)
                const scale = 0.5 + 0.5 * (tile.hp / tile.maxHp);
                sources.push({ col: tile.col, row: tile.row, emission: light.lightAmount * scale, radius: light.radius });
            }
        }
        return sources;
    }

    /** Build light sources from Torch effects (use current lightAmount/radius from effectData). */
    private getLightSourcesFromEffects(engine: GameEngine): LightSource[] {
        const grid = engine.terrainManager?.grid;
        if (!grid) return [];
        const sources: LightSource[] = [];
        for (const effect of engine.effects) {
            if (!effect.active || effect.effectType !== 'Torch') continue;
            const data = effect.effectData as { lightAmount?: number; radius?: number };
            const emission = data.lightAmount ?? 0;
            const radius = data.radius ?? 0;
            if (emission <= 0 || radius <= 0) continue;
            const { col, row } = grid.worldToGrid(effect.x, effect.y);
            sources.push({ col, row, emission, radius });
        }
        return sources;
    }

    private static lightSourcesKey(sources: LightSource[]): string {
        const parts = sources
            .slice()
            .sort((a, b) => a.col - b.col || a.row - b.row)
            .map((s) => `${s.col},${s.row},${s.emission},${s.radius}`);
        return parts.join('|');
    }

    private updateDarknessOverlay(engine: GameEngine): void {
        const grid = engine.terrainManager!.grid;
        const width = grid.width;
        const height = grid.height;
        const sources = [
            ...this.getLightSourcesFromSpecialTiles(engine.specialTiles),
            ...this.getLightSourcesFromEffects(engine),
        ];
        this.currentLightGrid = getLightGrid(this.globalLightLevel, width, height, sources);

        const overlayKey = `${GameRenderer.lightSourcesKey(sources)}|${this.globalLightLevel}|${width}|${height}`;
        if (overlayKey !== this.lastOverlayKey && this.darknessOverlaySprite) {
            this.lastOverlayKey = overlayKey;
            const worldW = width * CELL_SIZE;
            const worldH = height * CELL_SIZE;
            const canvas = document.createElement('canvas');
            canvas.width = worldW;
            canvas.height = worldH;
            const ctx = canvas.getContext('2d')!;
            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {
                    const level = this.currentLightGrid![row][col];
                    const alpha = GameRenderer.lightLevelToAlpha(level);
                    if (alpha > 0) {
                        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
                        ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                    }
                }
            }
            const oldTexture = this.darknessOverlaySprite.texture;
            this.darknessOverlaySprite.texture = Texture.from({ resource: canvas, label: 'darkness-overlay' });
            if (oldTexture && oldTexture !== this.darknessOverlaySprite.texture) {
                oldTexture.destroy(true);
            }
            this.darknessOverlaySprite.visible = true;
        }
    }

    /** Light level at grid cell; returns null if light system disabled or out of bounds. */
    private getLightAt(col: number, row: number): number | null {
        const grid = this.currentLightGrid;
        if (!grid) return null;
        if (row < 0 || row >= grid.length) return null;
        const r = grid[row];
        if (!r || col < 0 || col >= r.length) return null;
        return r[col];
    }

    /** Targeting state for preview (range rings, crosshair, selected targets). */
    private targetingState: {
        selectedAbility: {
            renderTargetingPreview?: (
                gr: unknown,
                caster: unknown,
                currentTargets: unknown[],
                mouseWorld: { x: number; y: number },
                units: unknown[],
                gameState?: unknown,
            ) => void;
            renderTargetingPreviewSelectedTargets?: (
                gr: unknown,
                caster: unknown,
                currentTargets: unknown[],
                mouseWorld: { x: number; y: number },
                units: unknown[],
                gameState?: unknown,
            ) => void;
        } | null;
        currentTargets: unknown[];
        mouseWorld: { x: number; y: number };
        waitingForOrders: { unitId: string } | null;
    } | null = null;

    /** Main render call: sync all visuals with engine state. */
    render(
        engine: GameEngine,
        camera: Camera,
        targetingState?: {
            selectedAbility: {
                renderTargetingPreview?: (
                    gr: unknown,
                    caster: unknown,
                    currentTargets: unknown[],
                    mouseWorld: { x: number; y: number },
                    units: unknown[],
                    gameState?: unknown,
                ) => void;
                renderTargetingPreviewSelectedTargets?: (
                    gr: unknown,
                    caster: unknown,
                    currentTargets: unknown[],
                    mouseWorld: { x: number; y: number },
                    units: unknown[],
                    gameState?: unknown,
                ) => void;
            } | null;
            currentTargets: unknown[];
            mouseWorld: { x: number; y: number };
            waitingForOrders: { unitId: string } | null;
        } | null,
    ): void {
        if (!this.initialized) return;

        this.currentEngine = engine;
        if (engine !== this.eventBusSource) {
            if (this.eventBusSource) {
                this.eventBusSource.eventBus.off('damage_taken', this.damageTakenBound);
            }
            this.eventBusSource = engine;
            if (engine) {
                engine.eventBus.on('damage_taken', this.damageTakenBound);
            }
            this.clearHitFlashes();
            this.lastOverlayKey = null;
            this.currentLightGrid = null;
        }

        this.targetingState = targetingState ?? null;

        // Update game container offset (camera)
        this.gameContainer.x = -camera.x + camera.viewportWidth / 2;
        this.gameContainer.y = -camera.y + camera.viewportHeight / 2;

        if (this.pendingUnitCharacterSpriteSync) {
            this.syncAllUnitCharacterSprites(engine);
            this.pendingUnitCharacterSpriteSync = false;
        }

        if (this.lightLevelEnabled && engine.terrainManager && debugSettingsSnapshot.darkOverlayEnabled) {
            this.updateDarknessOverlay(engine);
        } else {
            this.currentLightGrid = null;
            if (this.darknessOverlaySprite) this.darknessOverlaySprite.visible = false;
        }

        this.renderUnits(engine);
        this.renderCrystalAura(engine);
        this.renderDarkCrystalAura(engine);
        this.renderSpecialTiles(engine.specialTiles);
        this.renderMoveTargets(engine.units);
        this.renderProjectiles(engine.projectiles);
        this.renderEffects(engine.effects);
        this.renderActiveAbilityPreviews(engine);
        this.renderTargetingPreview(engine);
        this.cleanupStaleVisuals(engine);
    }

    // ========================================================================
    // Crystal aura & Special Tiles
    // ========================================================================

    /** Draw a soft blue filter (10% opacity) on each tile in crystal light radius. */
    private renderCrystalAura(engine: GameEngine): void {
        this.crystalAuraGraphics.clear();
        const grid = engine.terrainManager?.grid;
        if (!grid) return;
        const protectedSet = engine.getCrystalProtectedSet();
        if (protectedSet.size === 0) return;
        for (const key of protectedSet) {
            const [col, row] = key.split(',').map(Number);
            if (Number.isNaN(col) || Number.isNaN(row)) continue;
            this.crystalAuraGraphics.rect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            this.crystalAuraGraphics.fill({ color: 0x4488ff, alpha: 0.15 });
        }
    }

    /** Draw a purple filter on each tile in dark crystal filter radius (arena effect). */
    private renderDarkCrystalAura(engine: GameEngine): void {
        this.darkCrystalAuraGraphics.clear();
        const grid = engine.terrainManager?.grid;
        if (!grid) return;
        const filterSet = engine.getDarkCrystalFilterSet();
        if (filterSet.size === 0) return;
        const darkCrystals = engine.specialTiles.filter(
            (t) => t.defId === 'DarkCrystal' && t.hp > 0 && t.colorFilter,
        );
        const alpha = darkCrystals[0]?.colorFilter?.alpha ?? 0.2;
        const color = darkCrystals[0]?.colorFilter?.color ?? 0x6633aa;
        for (const key of filterSet) {
            const [col, row] = key.split(',').map(Number);
            if (Number.isNaN(col) || Number.isNaN(row)) continue;
            this.darkCrystalAuraGraphics.rect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            this.darkCrystalAuraGraphics.fill({ color, alpha });
        }
    }

    private renderSpecialTiles(specialTiles: SpecialTile[]): void {
        for (const tile of specialTiles) {
            if (tile.hp <= 0) continue;
            let visual = this.specialTileVisuals.get(tile.id);
            if (!visual) {
                visual = this.createSpecialTileVisual(tile);
                if (visual) {
                    this.specialTileVisuals.set(tile.id, visual);
                    this.specialTilesContainer.addChild(visual);
                }
            }
            if (visual) {
                const x = tile.col * CELL_SIZE + CELL_SIZE / 2;
                const y = tile.row * CELL_SIZE + CELL_SIZE / 2;
                visual.x = x;
                visual.y = y;
                // Update HP bar for Campfire
                if (tile.defId === 'Campfire' && visual.children.length > 1) {
                    const hpBar = visual.getChildAt(1) as Graphics;
                    if (hpBar) {
                        hpBar.clear();
                        const w = 24;
                        const h = 4;
                        const pct = tile.maxHp > 0 ? tile.hp / tile.maxHp : 0;
                        hpBar.rect(-w / 2, -CELL_SIZE / 2 - 8, w, h);
                        hpBar.fill({ color: 0x333333 });
                        hpBar.rect(-w / 2, -CELL_SIZE / 2 - 8, w * pct, h);
                        hpBar.fill({ color: 0x44aa44 });
                    }
                }
            }
        }

        // Remove visuals for tiles that no longer exist or have 0 HP
        const activeIds = new Set(specialTiles.filter((t) => t.hp > 0).map((t) => t.id));
        for (const [id, visual] of this.specialTileVisuals) {
            if (!activeIds.has(id)) {
                this.specialTilesContainer.removeChild(visual);
                visual.destroy();
                this.specialTileVisuals.delete(id);
            }
        }
    }

    private createSpecialTileVisual(tile: SpecialTile): Container | undefined {
        const def = getSpecialTileDef(tile.defId);
        if (!def) return undefined;
        const container = new Container();
        if (tile.defId === 'Campfire' && this.campfireTexture) {
            const sprite = new Sprite(this.campfireTexture);
            sprite.anchor.set(0.5, 1);
            sprite.width = 32;
            sprite.height = 32;
            container.addChild(sprite);
            const hpBar = new Graphics();
            container.addChild(hpBar);
        } else if (tile.defId === 'Crystal') {
            // Render crystals as small light blue diamonds
            const g = new Graphics();
            g.label = 'crystal';
            const halfSize = 8;
            g.moveTo(0, -halfSize); // top
            g.lineTo(halfSize, 0); // right
            g.lineTo(0, halfSize); // bottom
            g.lineTo(-halfSize, 0); // left
            g.closePath();
            g.fill({ color: 0x7dd3fc }); // light blue
            g.stroke({ color: 0x38bdf8, width: 1.5 });
            container.addChild(g);
        } else if (tile.defId === 'DarkCrystal') {
            const g = new Graphics();
            g.label = 'darkCrystal';
            const halfSize = 10;
            g.moveTo(0, -halfSize);
            g.lineTo(halfSize, 0);
            g.lineTo(0, halfSize);
            g.lineTo(-halfSize, 0);
            g.closePath();
            g.fill({ color: 0x8866cc });
            g.stroke({ color: 0x6633aa, width: 1.5 });
            container.addChild(g);
        } else {
            return undefined;
        }
        if (tile.defId !== 'Campfire') return container;
        const hpBar = container.getChildAt(1) as Graphics;
        if (!hpBar) return container;
        return container;
    }

    // ========================================================================
    // Units
    // ========================================================================

    private syncAllUnitCharacterSprites(engine: GameEngine): void {
        const context = this.getUnitRenderContext();
        for (const unit of engine.units) {
            const visual = this.unitVisuals.get(unit.id);
            if (!visual) continue;
            syncUnitCharacterSpriteIfNeeded(visual, unit, context);
        }
    }

    private getUnitRenderContext(): IUnitRenderContext {
        return {
            localTeamId: this.localTeamId,
            getCharacterTexture: (characterId: string) => {
                if (characterId === 'enemy_ranged') return this.slimeTexture;
                if (characterId === 'enemy_melee') return this.swordwomanTexture;
                if (characterId === 'dark_wolf') return this.wolfHeadTexture;
                if (characterId === 'alpha_wolf') return this.wolfHowlTexture;
                if (characterId === 'boar') return this.boarTexture;
                return null;
            },
        };
    }

    private renderUnits(engine: GameEngine): void {
        const units = engine.units;
        const context = this.getUnitRenderContext();
        const cellSize = CELL_SIZE;
        const gameTime = engine.gameTime;
        for (const unit of units) {
            let visual = this.unitVisuals.get(unit.id);
            if (!visual) {
                visual = renderUnit(unit, context);
                visual.zIndex = Z_INDEX.units;
                this.unitVisuals.set(unit.id, visual);
                this.gameContainer.addChild(visual);
            }
            visual.x = unit.x;
            visual.y = unit.y;
            visual.visible = unit.active;

            const col = Math.floor(unit.x / cellSize);
            const row = Math.floor(unit.y / cellSize);
            const light = this.getLightAt(col, row);
            const inFullDarkness =
                light !== null && light <= -20 && areEnemies(this.localTeamId, unit.teamId);
            const isDebugOutlined = this.debugUnitOutlineId === unit.id;

            const body = visual.children.find((c) => c.label === 'body') as Graphics | undefined;
            const hpBg = visual.children.find((c) => c.label === 'hpBg');
            const hpFill = visual.children.find((c) => c.label === 'hpFill');
            const characterSprite = visual.children.find((c) => c.label === 'characterSprite');
            const label = visual.children.find((c) => c.label === 'label');
            const glow = visual.children.find((c) => c.label === 'glow');
            const playerRing = visual.children.find((c) => c.label === 'playerRing');

            if (inFullDarkness && body) {
                body.clear();
                body.circle(0, 0, unit.radius);
                body.fill({ color: 0xef4444 });
                body.stroke({ color: 0xef4444, width: 1 });
                if (isDebugOutlined) {
                    // Yellow outline for debug focus (even in full darkness).
                    body.stroke({ color: 0xfacc15, width: 3 });
                    body.circle(0, 0, unit.radius + 4);
                    body.stroke({ color: 0xfacc15, width: 2 });
                }
                if (hpBg) hpBg.visible = false;
                if (hpFill) hpFill.visible = false;
                if (characterSprite) characterSprite.visible = false;
                if (label) label.visible = false;
                if (glow) glow.visible = false;
                if (playerRing) playerRing.visible = false;
            } else {
                if (body) {
                    body.clear();
                    body.circle(0, 0, unit.radius);
                    body.fill(getBodyColor(unit.characterId));
                    body.stroke({ color: 0x000000, width: 1 });
                    if (isDebugOutlined) {
                        // Yellow outline for debug focus.
                        body.stroke({ color: 0xfacc15, width: 3 });
                        body.circle(0, 0, unit.radius + 4);
                        body.stroke({ color: 0xfacc15, width: 2 });
                    }
                }
                if (hpBg) hpBg.visible = true;
                if (hpFill) hpFill.visible = true;
                if (characterSprite) characterSprite.visible = true;
                if (label) label.visible = !characterSprite;
                if (glow) glow.visible = true;
                if (playerRing) playerRing.visible = true;
                updateUnitHpBar(visual, unit);
            }

            // Darkness corruption bar: only visible when progress > 0 (above unit)
            let corruptionBar = visual.children.find((c) => c.label === 'corruptionBar') as Graphics | undefined;
            if (unit.corruptionProgress > 0) {
                if (!corruptionBar) {
                    corruptionBar = new Graphics();
                    corruptionBar.label = 'corruptionBar';
                    visual.addChild(corruptionBar);
                }
                corruptionBar.visible = true;
                corruptionBar.clear();
                const w = 24;
                const h = 4;
                const y = -unit.radius - 14;
                corruptionBar.rect(-w / 2, y, w, h);
                corruptionBar.fill({ color: 0x332244 });
                corruptionBar.rect(-w / 2, y, w * unit.corruptionProgress, h);
                corruptionBar.fill({ color: 0x663399 });
                corruptionBar.rect(-w / 2, y, w, h);
                corruptionBar.stroke({ color: 0x9966cc, width: 1 });
            } else {
                if (corruptionBar) corruptionBar.visible = false;
            }

            // Buff effects: each buff renders its own visual (e.g. stunned stars)
            let buffEffects = visual.children.find((c) => c.label === 'buffEffects') as Graphics | undefined;
            if (unit.buffs.length > 0 && !inFullDarkness) {
                if (!buffEffects) {
                    buffEffects = new Graphics();
                    buffEffects.label = 'buffEffects';
                    visual.addChild(buffEffects);
                }
                buffEffects.visible = true;
                buffEffects.clear();
                const buffCtx = { gameTime };
                for (const buff of unit.buffs) {
                    const renderer = getBuffVisualRenderer(buff._type);
                    renderer(buffEffects, unit, buff, buffCtx);
                }
            } else {
                if (buffEffects) buffEffects.visible = false;
            }
        }
    }

    // ========================================================================
    // Hit flash (real-time, not paused)
    // ========================================================================

    private onDamageTaken(data: DamageTakenEvent): void {
        const container = this.unitVisuals.get(data.unitId);
        const unit = this.currentEngine?.getUnit(data.unitId);
        if (!container || !unit) return;
        this.startHitFlash(data.unitId, container, unit.radius);
    }

    /**
     * Run a 0.3s red flash on the unit using real time (Date.now()).
     * Fades from transparent to full opacity over first half, then back to transparent.
     */
    private startHitFlash(unitId: string, container: Container, radius: number): void {
        const existing = this.hitFlashState.get(unitId);
        if (existing) {
            cancelAnimationFrame(existing.rafId);
        }

        let hitFlash = container.children.find((c) => c.label === 'hitFlash') as Graphics | undefined;
        if (!hitFlash) {
            hitFlash = new Graphics();
            hitFlash.label = 'hitFlash';
            hitFlash.eventMode = 'none';
            container.addChild(hitFlash);
        }
        hitFlash.visible = true;

        const startTime = Date.now();
        this.hitFlashState.set(unitId, { startTime, rafId: 0 });

        const tick = (): void => {
            const state = this.hitFlashState.get(unitId);
            if (!state) return;
            const elapsed = (Date.now() - state.startTime) / 1000;
            if (elapsed >= HIT_FLASH_DURATION) {
                this.hitFlashState.delete(unitId);
                hitFlash!.visible = false;
                hitFlash!.clear();
                return;
            }
            // First half: 0 -> 1, second half: 1 -> 0
            const alpha = elapsed < HIT_FLASH_DURATION / 2
                ? (elapsed / (HIT_FLASH_DURATION / 2))
                : (1 - (elapsed - HIT_FLASH_DURATION / 2) / (HIT_FLASH_DURATION / 2));
            hitFlash!.clear();
            hitFlash!.circle(0, 0, radius);
            hitFlash!.fill({ color: 0xff0000, alpha: 1 });
            hitFlash!.alpha = alpha;
            state.rafId = requestAnimationFrame(tick);
        };
        const state = this.hitFlashState.get(unitId)!;
        state.rafId = requestAnimationFrame(tick);
    }

    // ========================================================================
    // Move Targets
    // ========================================================================

    private renderMoveTargets(units: Unit[]): void {
        const activeIds = new Set<string>();

        for (const unit of units) {
            if (!unit.active || !unit.movement || unit.movement.path.length === 0) continue;
            // Only show move targets for player-controlled units on the local team
            if (!unit.isPlayerControlled() || areEnemies(this.localTeamId, unit.teamId)) continue;

            const key = `mt_${unit.id}`;
            activeIds.add(key);

            let visual = this.moveTargetVisuals.get(key);
            if (!visual) {
                visual = new Graphics();
                visual.zIndex = Z_INDEX.moveTargets;
                this.moveTargetVisuals.set(key, visual);
                // Insert above terrain (and darkness overlay + special tiles when present) but below units
                const insertIndex = this.darknessOverlaySprite ? 3 : this.terrainSprite ? 1 : 0;
                this.gameContainer.addChildAt(visual, insertIndex);
            }

            visual.clear();
            visual.visible = true;
            // Position at origin so we can draw in world coordinates
            visual.x = 0;
            visual.y = 0;

            const path = unit.movement.path;

            // Draw path line from unit position through grid cell centers
            // First: thick light outline underneath (1px thicker than main stroke).
            visual.moveTo(unit.x, unit.y);
            for (const cell of path) {
                const wx = cell.col * CELL_SIZE + CELL_SIZE / 2;
                const wy = cell.row * CELL_SIZE + CELL_SIZE / 2;
                visual.lineTo(wx, wy);
            }
            visual.stroke({ color: MOVE_TARGET_PATH_BG_COLOR, width: 3, alpha: 0.7 });

            // Second: original dark path on top.
            visual.moveTo(unit.x, unit.y);
            for (const cell of path) {
                const wx = cell.col * CELL_SIZE + CELL_SIZE / 2;
                const wy = cell.row * CELL_SIZE + CELL_SIZE / 2;
                visual.lineTo(wx, wy);
            }
            // Darker inner path stroke should be fully opaque for readability.
            visual.stroke({ color: MOVE_TARGET_COLOR, width: 2 });

            // Destination marker at last cell
            const lastCell = path[path.length - 1];
            const destX = lastCell.col * CELL_SIZE + CELL_SIZE / 2;
            const destY = lastCell.row * CELL_SIZE + CELL_SIZE / 2;

            // Outer ring at destination
            visual.circle(destX, destY, 8);
            // Light background ring (1px thicker than dark ring).
            visual.stroke({ color: MOVE_TARGET_PATH_BG_COLOR, width: 3, alpha: 0.7 });

            // Dark ring on top.
            visual.circle(destX, destY, 8);
            visual.stroke({ color: MOVE_TARGET_COLOR, width: 2, alpha: 1 });

            // Inner dot at destination
            visual.circle(destX, destY, 2);
            // Light dot background for two-tone treatment.
            visual.fill({ color: MOVE_TARGET_PATH_BG_COLOR, alpha: 0.7 });

            // Dark dot on top.
            visual.circle(destX, destY, 2);
            visual.fill({ color: MOVE_TARGET_COLOR, alpha: 1 });
        }

        // Hide visuals for units that no longer have a move target
        for (const [key, visual] of this.moveTargetVisuals) {
            if (!activeIds.has(key)) {
                visual.visible = false;
            }
        }
    }

    // ========================================================================
    // Active ability previews (e.g. enemy telegraphs, visible to all players)
    // ========================================================================

    private renderActiveAbilityPreviews(engine: GameEngine): void {
        this.abilityPreviewGraphics.clear();
        const cellSize = CELL_SIZE;
        for (const unit of engine.units) {
            if (!unit.isAlive()) continue;
            if (areEnemies(this.localTeamId, unit.teamId) && this.currentLightGrid) {
                const col = Math.floor(unit.x / cellSize);
                const row = Math.floor(unit.y / cellSize);
                const light = this.getLightAt(col, row);
                if (light !== null && light <= -20) continue;
            }
            for (const active of unit.activeAbilities) {
                const ability = getAbility(active.abilityId);
                if (ability?.renderActivePreview) {
                    ability.renderActivePreview(
                        this.abilityPreviewGraphics as unknown as import('../abilities/Ability').IAbilityPreviewGraphics,
                        unit,
                        active,
                        engine.gameTime,
                    );
                }
            }
        }
    }

    private renderTargetingPreview(engine: GameEngine): void {
        const ts = this.targetingState;
        if (!ts) {
            this.targetingPreviewGraphics.clear();
            return;
        }
        const ability = ts.selectedAbility;
        if (!ability?.renderTargetingPreview || !ts.waitingForOrders) {
            this.targetingPreviewGraphics.clear();
            return;
        }

        const caster = engine.getUnit(ts.waitingForOrders!.unitId);
        if (!caster) {
            this.targetingPreviewGraphics.clear();
            return;
        }

        this.targetingPreviewGraphics.clear();
        ability.renderTargetingPreview!(
            this.targetingPreviewGraphics as unknown as import('../abilities/Ability').IAbilityPreviewGraphics,
            caster,
            ts.currentTargets,
            ts.mouseWorld,
            engine.units,
            engine,
        );

        if (ability.renderTargetingPreviewSelectedTargets) {
            ability.renderTargetingPreviewSelectedTargets(
                this.targetingPreviewGraphics as unknown as import('../abilities/Ability').IAbilityPreviewGraphics,
                caster,
                ts.currentTargets,
                ts.mouseWorld,
                engine.units,
                engine,
            );
        }
    }

    // ========================================================================
    // Projectiles
    // ========================================================================

    private renderProjectiles(projectiles: Projectile[]): void {
        for (const proj of projectiles) {
            let visual = this.projectileVisuals.get(proj.id);
            if (!visual) {
                visual = Projectile.createVisual(proj);
                visual.zIndex = 11; // Above darkness (5)
                this.projectileVisuals.set(proj.id, visual);
                this.gameContainer.addChild(visual);
            }
            visual.x = proj.x;
            visual.y = proj.y;
            visual.visible = proj.active;
        }
    }

    // ========================================================================
    // Effects
    // ========================================================================

    private renderEffects(effects: Effect[]): void {
        const unitContext = this.getUnitRenderContext();
        const context: IEffectRenderContext = {
            getEffectTexture: (imageKey: EffectImageKey) => this.effectTextures[imageKey] ?? null,
            getCharacterTexture: (characterId: string) => unitContext.getCharacterTexture(characterId),
        };
        for (const effect of effects) {
            let visual = this.effectVisuals.get(effect.id);
            if (!visual) {
                visual = createEffectVisual(effect, context);
                visual.zIndex = Z_INDEX.effects;
                this.effectVisuals.set(effect.id, visual);
                this.gameContainer.addChild(visual);
            }
            visual.x = effect.x;
            visual.y = effect.y;
            visual.visible = effect.active;
            updateEffectVisual(visual, effect, context);
        }
    }

    // ========================================================================
    // Cleanup
    // ========================================================================

    private cleanupStaleVisuals(engine: GameEngine): void {
        const activeUnitIds = new Set(engine.units.map((u) => u.id));
        for (const [id, visual] of this.unitVisuals) {
            if (!activeUnitIds.has(id)) {
                this.gameContainer.removeChild(visual);
                visual.destroy();
                this.unitVisuals.delete(id);
            }
        }

        // Clean up move target visuals for dead/removed units
        for (const [key, visual] of this.moveTargetVisuals) {
            const unitId = key.replace('mt_', '');
            if (!activeUnitIds.has(unitId)) {
                this.gameContainer.removeChild(visual);
                visual.destroy();
                this.moveTargetVisuals.delete(key);
            }
        }

        const activeProjIds = new Set(engine.projectiles.map((p) => p.id));
        for (const [id, visual] of this.projectileVisuals) {
            if (!activeProjIds.has(id)) {
                this.gameContainer.removeChild(visual);
                visual.destroy();
                this.projectileVisuals.delete(id);
            }
        }

        const activeEffectIds = new Set(engine.effects.map((e) => e.id));
        for (const [id, visual] of this.effectVisuals) {
            if (!activeEffectIds.has(id)) {
                this.gameContainer.removeChild(visual);
                visual.destroy();
                this.effectVisuals.delete(id);
            }
        }
    }

    /** Full cleanup. Idempotent: safe to call multiple times. */
    destroy(): void {
        if (!this.initialized) return;
        if (this.eventBusSource) {
            this.eventBusSource.eventBus.off('damage_taken', this.damageTakenBound);
            this.eventBusSource = null;
        }
        this.clearHitFlashes();
        this.abilityPreviewGraphics.destroy();
        this.targetingPreviewGraphics.destroy();
        for (const visual of this.unitVisuals.values()) visual.destroy();
        for (const visual of this.moveTargetVisuals.values()) visual.destroy();
        for (const visual of this.projectileVisuals.values()) visual.destroy();
        for (const visual of this.effectVisuals.values()) visual.destroy();
        for (const visual of this.specialTileVisuals.values()) visual.destroy();
        if (this.darknessOverlaySprite) {
            this.darknessOverlaySprite.destroy();
            this.darknessOverlaySprite = null;
        }
        this.unitVisuals.clear();
        this.moveTargetVisuals.clear();
        this.projectileVisuals.clear();
        this.effectVisuals.clear();
        this.specialTileVisuals.clear();
        this.terrainRenderer.destroy();
        this.terrainSprite = null;
        this.gameContainer.destroy();
        this.initInFlight = null;
        this.app.destroy();
        clearLightGridCache();
        this.initialized = false;
    }
}
