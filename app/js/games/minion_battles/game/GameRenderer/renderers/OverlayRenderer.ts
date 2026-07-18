import { Graphics, Sprite, Texture } from 'pixi.js';
import type { Container } from 'pixi.js';
import { DarknessLevel } from '../../darknessLevels';
import { type FogFilter, tryCreateFogFilter } from '../../FogFilter';
import type { GameEngine } from '../../GameEngine';
import type { AssetRegistry } from '../AssetRegistry';
import { CELL_SIZE } from '../../../terrain/TerrainGrid';
import { TerrainType } from '../../../terrain/TerrainType';
import { debugSettingsSnapshot } from '../../../../../debug/debugSettingsStore';

const Z_CRYSTAL_AURA = 2;
const Z_DARKNESS = 5;
const Z_FOG_TINT = 13;

export class OverlayRenderer {
    private darknessOverlaySprite: Sprite | null = null;
    private fogTintSprite: Sprite | null = null;
    private fogFilter: FogFilter | null = null;
    private crystalAuraGraphics: Graphics = new Graphics();
    private darkCrystalAuraGraphics: Graphics = new Graphics();

    private lastOverlayTick: number = -1;
    private lastRenderTime: number = 0;
    private lightSystemActive: boolean = false;

    private lightLevelEnabled: boolean = true;

    /** Cached engine set each render — used by getLightAt queries from other renderers. */
    private currentEngine: GameEngine | null = null;

    constructor(
        private readonly gameContainer: Container,
        private readonly _assets: AssetRegistry,
    ) {}

    /** Called by GameRenderer.setMissionLightConfig(). */
    setLightConfig(lightLevelEnabled: boolean): void {
        this.lightLevelEnabled = lightLevelEnabled;
    }

    /**
     * Called from buildTerrainSprite after terrain is placed in the scene.
     * Sets up darkness overlay, fog filter, crystal aura graphics, and adds them to the container.
     * Idempotent — sprites are only created once.
     */
    initSprites(lightLevelEnabled: boolean): void {
        this.lightLevelEnabled = lightLevelEnabled;

        if (!this.darknessOverlaySprite) {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            this.darknessOverlaySprite = new Sprite(Texture.from({ resource: canvas, label: 'darkness-overlay' }));
            this.darknessOverlaySprite.label = 'darknessOverlay';

            this.fogFilter = tryCreateFogFilter();
            if (this.fogFilter) {
                this.fogFilter.fogStartAlpha = OverlayRenderer.lightLevelToAlpha(DarknessLevel.DARKNESS_FOG);
                this.darknessOverlaySprite.filters = [this.fogFilter];
            }

            this.fogTintSprite = new Sprite(this.darknessOverlaySprite.texture);
            this.fogTintSprite.label = 'fogTintOverlay';
            this.fogTintSprite.alpha = 0.15;
        }

        this.darknessOverlaySprite.zIndex = Z_DARKNESS;
        if (!this.darknessOverlaySprite.parent) {
            this.gameContainer.addChildAt(this.darknessOverlaySprite, 1);
        }
        this.darknessOverlaySprite.visible = lightLevelEnabled;

        if (this.fogTintSprite) {
            this.fogTintSprite.zIndex = Z_FOG_TINT;
            if (!this.fogTintSprite.parent) {
                this.gameContainer.addChild(this.fogTintSprite);
            }
            this.fogTintSprite.visible = lightLevelEnabled;
        }

        this.crystalAuraGraphics.zIndex = Z_CRYSTAL_AURA;
        if (!this.crystalAuraGraphics.parent) {
            this.gameContainer.addChildAt(this.crystalAuraGraphics, 1);
        }
        this.darkCrystalAuraGraphics.zIndex = Z_CRYSTAL_AURA + 1;
        if (!this.darkCrystalAuraGraphics.parent) {
            this.gameContainer.addChildAt(this.darkCrystalAuraGraphics, 1);
        }
    }

    /** True when the light system is active this frame (enemies in darkness should be hidden). */
    isLightSystemActive(): boolean {
        return this.lightSystemActive;
    }

    /** True once initSprites() has created the darkness overlay sprite. */
    hasDarknessOverlay(): boolean {
        return this.darknessOverlaySprite !== null;
    }

    /** Light level at grid cell. Returns null if the engine has no light data. */
    getLightAt(col: number, row: number): number | null {
        return this.currentEngine?.getLightAt(col, row) ?? null;
    }

    /** Reset overlay state when the engine is unbound (e.g. mission restart). */
    reset(): void {
        this.lastOverlayTick = -1;
        this.lightSystemActive = false;
        this.lastRenderTime = 0;
    }

    setLayerVisible(visible: boolean): void {
        if (visible) return;
        if (this.darknessOverlaySprite) this.darknessOverlaySprite.visible = false;
        if (this.fogTintSprite) this.fogTintSprite.visible = false;
        this.crystalAuraGraphics.visible = false;
        this.darkCrystalAuraGraphics.visible = false;
    }

    /** Main render call. Handles darkness overlay, fog animation, and crystal auras. */
    render(engine: GameEngine): void {
        this.currentEngine = engine;

        if (this.lightLevelEnabled && engine.terrainManager && debugSettingsSnapshot.darkOverlayEnabled) {
            this.updateDarknessOverlay(engine);
            if (this.fogFilter) {
                const now = performance.now();
                if (this.lastRenderTime > 0) {
                    this.fogFilter.advanceTime((now - this.lastRenderTime) * 0.001);
                }
                this.lastRenderTime = now;
            }
        } else {
            this.lightSystemActive = false;
            if (this.darknessOverlaySprite) this.darknessOverlaySprite.visible = false;
            if (this.fogTintSprite) this.fogTintSprite.visible = false;
            this.lastRenderTime = 0;
        }

        this.renderCrystalAura(engine);
        this.renderDarkCrystalAura(engine);
    }

    private updateDarknessOverlay(engine: GameEngine): void {
        const tileGrid = engine.state.lightTileGrid;
        const terrainGrid = engine.terrainManager!.grid;
        const width = terrainGrid.width;
        const height = terrainGrid.height;

        this.lightSystemActive = engine.state.lightLevelEnabled;

        if (engine.state.gameTick !== this.lastOverlayTick && this.darknessOverlaySprite) {
            this.lastOverlayTick = engine.state.gameTick;
            const worldW = width * CELL_SIZE;
            const worldH = height * CELL_SIZE;
            const canvas = document.createElement('canvas');
            canvas.width = worldW;
            canvas.height = worldH;
            const ctx = canvas.getContext('2d')!;
            for (let row = 0; row < height; row++) {
                for (let col = 0; col < width; col++) {
                    // Impassable renders as void with no fog/darkness overlay — same as the area
                    // outside the map bounds, which this overlay's grid never even reaches.
                    if (terrainGrid.get(col, row) === TerrainType.Impassable) continue;
                    const level = tileGrid ? tileGrid.get(row, col) : engine.state.globalLightLevel;
                    const alpha = OverlayRenderer.lightLevelToAlpha(level);
                    if (alpha > 0) {
                        ctx.fillStyle = `rgba(20,0,35,${alpha})`;
                        ctx.fillRect(col * CELL_SIZE, row * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                    } else if (level >= DarknessLevel.SUNLIGHT) {
                        ctx.fillStyle = `rgba(255,245,200,0.08)`;
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

            if (this.fogTintSprite) {
                this.fogTintSprite.texture = this.darknessOverlaySprite.texture;
                this.fogTintSprite.visible = true;
            }
        }
    }

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

    static lightLevelToAlpha(level: number): number {
        const LightLevel = Math.floor(level);

        if (LightLevel <= DarknessLevel.FULL_DARKNESS) return 1;
        if (LightLevel >= DarknessLevel.SUNLIGHT) return 0;

        // Level 11–15: interpolate 0.2 → 0
        if (LightLevel >= 11) {
            const t = (LightLevel - 11) / (DarknessLevel.SUNLIGHT - 1 - 11);
            return 0.2 * (1 - t);
        }

        // Level 4–11: interpolate 0.3 → 0.2
        if (LightLevel >= DarknessLevel.MEDIUM_LIGHT_MIN) {
            const t = (LightLevel - DarknessLevel.MEDIUM_LIGHT_MIN) / (11 - DarknessLevel.MEDIUM_LIGHT_MIN);
            return 0.3 - 0.1 * t;
        }

        // Level 1–3: interpolate 1.0 → 0.3
        const t = LightLevel / 3;
        return 1 - 0.7 * t;
    }

    destroy(): void {
        if (this.fogTintSprite) {
            this.fogTintSprite.destroy();
            this.fogTintSprite = null;
        }
        if (this.fogFilter) {
            this.fogFilter.destroy();
            this.fogFilter = null;
        }
        if (this.darknessOverlaySprite) {
            this.darknessOverlaySprite.destroy();
            this.darknessOverlaySprite = null;
        }
        this.crystalAuraGraphics.destroy();
        this.darkCrystalAuraGraphics.destroy();
    }
}
