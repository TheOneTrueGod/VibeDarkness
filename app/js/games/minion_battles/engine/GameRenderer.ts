/**
 * GameRenderer - Bridges the game engine state to PixiJS visuals.
 *
 * Maintains a PixiJS Application and a map of visual containers for
 * each game object. Each render tick syncs sprite positions from
 * engine objects with camera offsets applied.
 */

import { Application, Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { GameEngine } from './GameEngine';
import type { Camera } from './Camera';
import type { Unit } from '../objects/Unit';
import { getAbility } from '../abilities/AbilityRegistry';
import { Projectile } from '../objects/Projectile';
import type { Effect } from '../objects/Effect';
import { areEnemies } from './teams';
import type { TeamId } from './teams';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainRenderer } from '../terrain/TerrainRenderer';
import { renderUnit, updateUnitHpBar, type IUnitRenderContext } from './unitDef';
import { createEffectVisual, updateEffectVisual } from './effectDef';
import { getSpecialTileDef } from '../missions/specialTileDefs';
import type { SpecialTile } from '../objects/SpecialTile';

/** Color for move target markers. */
const MOVE_TARGET_COLOR = 0x000000;

/** Ranged enemy character sprite: displayed slightly smaller than the unit hitbox circle. */
const BOWMAN_SVG_URL = new URL('../assets/characters/bowman.svg', import.meta.url).href;
/** Melee enemy character sprite (swordwoman). */
const SWORDWOMAN_SVG_URL = new URL('../assets/characters/swordwoman.svg', import.meta.url).href;
/** Dark Wolf character sprite (wolf head). */
const WOLF_HEAD_SVG_URL = new URL('../assets/characters/dark_animals/wolf-head.svg', import.meta.url).href;

export class GameRenderer {
    app: Application;
    private gameContainer: Container;
    private unitVisuals: Map<string, Container> = new Map();
    private moveTargetVisuals: Map<string, Graphics> = new Map();
    private projectileVisuals: Map<string, Graphics> = new Map();
    private effectVisuals: Map<string, Graphics> = new Map();
    private abilityPreviewGraphics: Graphics = new Graphics();
    private targetingPreviewGraphics: Graphics = new Graphics();
    private initialized: boolean = false;

    /** The team ID used to determine friend/foe glow colors. */
    localTeamId: TeamId = 'player';

    /** Terrain renderer (builds and caches the terrain sprite). */
    private terrainRenderer: TerrainRenderer = new TerrainRenderer();
    private terrainSprite: Sprite | null = null;
    private pendingTerrainGrid: TerrainGrid | null = null;
    /** Container for special tiles (above terrain, below units). */
    private specialTilesContainer: Container = new Container();
    private specialTileVisuals: Map<string, Container> = new Map();

    /** Cached texture for ranged enemy (bowman) character sprite. */
    private bowmanTexture: Texture | null = null;
    /** Cached texture for melee enemy (swordwoman) character sprite. */
    private swordwomanTexture: Texture | null = null;
    /** Cached texture for dark_wolf (wolf head) character sprite. */
    private wolfHeadTexture: Texture | null = null;
    /** Cached texture for DefendPoint (campfire). */
    private defendPointTexture: Texture | null = null;

    constructor() {
        this.app = new Application();
        this.gameContainer = new Container();
    }

    async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
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
        this.abilityPreviewGraphics.zIndex = 100;
        this.gameContainer.addChild(this.abilityPreviewGraphics);
        this.targetingPreviewGraphics.zIndex = 101;
        this.gameContainer.addChild(this.targetingPreviewGraphics);
        this.initialized = true;

        try {
            this.bowmanTexture = (await Assets.load(BOWMAN_SVG_URL)) as Texture;
        } catch {
            // Non-fatal: ranged enemies will show the default circle + initial
        }
        try {
            this.swordwomanTexture = (await Assets.load(SWORDWOMAN_SVG_URL)) as Texture;
        } catch {
            // Non-fatal: melee enemies will show the default circle + initial
        }
        try {
            this.wolfHeadTexture = (await Assets.load(WOLF_HEAD_SVG_URL)) as Texture;
        } catch {
            // Non-fatal: dark_wolf will show the default circle + initial
        }
        const defendPointDef = getSpecialTileDef('DefendPoint');
        if (defendPointDef?.image) {
            try {
                this.defendPointTexture = (await Assets.load(defendPointDef.image)) as Texture;
            } catch {
                // Non-fatal: DefendPoint will not render
            }
        }

        // Build terrain sprite if it was queued before init completed
        if (this.pendingTerrainGrid) {
            this.buildTerrainSprite(this.pendingTerrainGrid);
            this.pendingTerrainGrid = null;
        }
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

    /** Build the cached terrain sprite and add it at the bottom of the scene. */
    private buildTerrainSprite(terrainGrid: TerrainGrid): void {
        if (this.terrainSprite) {
            this.gameContainer.removeChild(this.terrainSprite);
        }

        this.terrainSprite = this.terrainRenderer.buildSprite(terrainGrid);
        // Insert terrain at the very bottom of the game container
        this.gameContainer.addChildAt(this.terrainSprite, 0);
        // Insert special tiles container above terrain (index 1)
        if (!this.specialTilesContainer.parent) {
            this.gameContainer.addChildAt(this.specialTilesContainer, 1);
        }
    }

    /** Resize the renderer (e.g. on window resize). */
    resize(width: number, height: number): void {
        if (!this.initialized) return;
        this.app.renderer.resize(width, height);
    }

    /** Targeting state for preview (range rings, crosshair). */
    private targetingState: {
        selectedAbility: { renderTargetingPreview?: (gr: unknown, caster: unknown, currentTargets: unknown[], mouseWorld: { x: number; y: number }, units: unknown[]) => void } | null;
        currentTargets: unknown[];
        mouseWorld: { x: number; y: number };
        waitingForOrders: { unitId: string } | null;
    } | null = null;

    /** Main render call: sync all visuals with engine state. */
    render(
        engine: GameEngine,
        camera: Camera,
        targetingState?: {
            selectedAbility: { renderTargetingPreview?: (gr: unknown, caster: unknown, currentTargets: unknown[], mouseWorld: { x: number; y: number }, units: unknown[]) => void } | null;
            currentTargets: unknown[];
            mouseWorld: { x: number; y: number };
            waitingForOrders: { unitId: string } | null;
        } | null,
    ): void {
        if (!this.initialized) return;

        this.targetingState = targetingState ?? null;

        // Update game container offset (camera)
        this.gameContainer.x = -camera.x + camera.viewportWidth / 2;
        this.gameContainer.y = -camera.y + camera.viewportHeight / 2;

        this.renderUnits(engine.units);
        this.renderSpecialTiles(engine.specialTiles);
        this.renderMoveTargets(engine.units);
        this.renderProjectiles(engine.projectiles);
        this.renderEffects(engine.effects);
        this.renderActiveAbilityPreviews(engine);
        this.renderTargetingPreview(engine);
        this.cleanupStaleVisuals(engine);
    }

    // ========================================================================
    // Special Tiles
    // ========================================================================

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
                // Update HP bar for DefendPoint
                if (tile.defId === 'DefendPoint' && visual.children.length > 1) {
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
        if (!def || def.id !== 'DefendPoint') return undefined;
        const container = new Container();
        if (this.defendPointTexture) {
            const sprite = new Sprite(this.defendPointTexture);
            sprite.anchor.set(0.5, 1);
            sprite.width = 32;
            sprite.height = 32;
            container.addChild(sprite);
        }
        const hpBar = new Graphics();
        container.addChild(hpBar);
        return container;
    }

    // ========================================================================
    // Units
    // ========================================================================

    private getUnitRenderContext(): IUnitRenderContext {
        return {
            localTeamId: this.localTeamId,
            getCharacterTexture: (characterId: string) => {
                if (characterId === 'enemy_ranged') return this.bowmanTexture;
                if (characterId === 'enemy_melee') return this.swordwomanTexture;
                if (characterId === 'dark_wolf') return this.wolfHeadTexture;
                return null;
            },
        };
    }

    private renderUnits(units: Unit[]): void {
        const context = this.getUnitRenderContext();
        for (const unit of units) {
            let visual = this.unitVisuals.get(unit.id);
            if (!visual) {
                visual = renderUnit(unit, context);
                this.unitVisuals.set(unit.id, visual);
                this.gameContainer.addChild(visual);
            }
            visual.x = unit.x;
            visual.y = unit.y;
            visual.visible = unit.active;

            updateUnitHpBar(visual, unit);
        }
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
                this.moveTargetVisuals.set(key, visual);
                // Insert above terrain but below units
                this.gameContainer.addChildAt(visual, this.terrainSprite ? 1 : 0);
            }

            visual.clear();
            visual.visible = true;
            // Position at origin so we can draw in world coordinates
            visual.x = 0;
            visual.y = 0;

            const path = unit.movement.path;

            // Draw path line from unit position through grid cell centers
            visual.moveTo(unit.x, unit.y);
            for (const cell of path) {
                const wx = cell.col * CELL_SIZE + CELL_SIZE / 2;
                const wy = cell.row * CELL_SIZE + CELL_SIZE / 2;
                visual.lineTo(wx, wy);
            }
            visual.stroke({ color: MOVE_TARGET_COLOR, width: 2, alpha: 0.4 });

            // Destination marker at last cell
            const lastCell = path[path.length - 1];
            const destX = lastCell.col * CELL_SIZE + CELL_SIZE / 2;
            const destY = lastCell.row * CELL_SIZE + CELL_SIZE / 2;

            // Outer ring at destination
            visual.circle(destX, destY, 8);
            visual.stroke({ color: MOVE_TARGET_COLOR, width: 2 });

            // Inner dot at destination
            visual.circle(destX, destY, 2);
            visual.fill({ color: MOVE_TARGET_COLOR });
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
        for (const unit of engine.units) {
            if (!unit.isAlive()) continue;
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
        if (!ts?.selectedAbility?.renderTargetingPreview || !ts.waitingForOrders) {
            this.targetingPreviewGraphics.clear();
            return;
        }

        const caster = engine.getUnit(ts.waitingForOrders.unitId);
        if (!caster) {
            this.targetingPreviewGraphics.clear();
            return;
        }

        this.targetingPreviewGraphics.clear();
        ts.selectedAbility.renderTargetingPreview!(
            this.targetingPreviewGraphics as unknown as import('../abilities/Ability').IAbilityPreviewGraphics,
            caster,
            ts.currentTargets,
            ts.mouseWorld,
            engine.units,
        );
    }

    // ========================================================================
    // Projectiles
    // ========================================================================

    private renderProjectiles(projectiles: Projectile[]): void {
        for (const proj of projectiles) {
            let visual = this.projectileVisuals.get(proj.id);
            if (!visual) {
                visual = Projectile.createVisual(proj);
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
        for (const effect of effects) {
            let visual = this.effectVisuals.get(effect.id);
            if (!visual) {
                visual = createEffectVisual(effect);
                this.effectVisuals.set(effect.id, visual);
                this.gameContainer.addChild(visual);
            }
            visual.x = effect.x;
            visual.y = effect.y;
            visual.visible = effect.active;
            updateEffectVisual(visual, effect);
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

    /** Full cleanup. */
    destroy(): void {
        this.abilityPreviewGraphics.destroy();
        this.targetingPreviewGraphics.destroy();
        for (const visual of this.unitVisuals.values()) visual.destroy();
        for (const visual of this.moveTargetVisuals.values()) visual.destroy();
        for (const visual of this.projectileVisuals.values()) visual.destroy();
        for (const visual of this.effectVisuals.values()) visual.destroy();
        for (const visual of this.specialTileVisuals.values()) visual.destroy();
        this.unitVisuals.clear();
        this.moveTargetVisuals.clear();
        this.projectileVisuals.clear();
        this.effectVisuals.clear();
        this.specialTileVisuals.clear();
        this.terrainRenderer.destroy();
        this.terrainSprite = null;
        this.gameContainer.destroy();
        this.app.destroy();
        this.initialized = false;
    }
}
