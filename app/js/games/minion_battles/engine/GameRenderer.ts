/**
 * GameRenderer - Bridges the game engine state to PixiJS visuals.
 *
 * Maintains a PixiJS Application and a map of visual containers for
 * each game object. Each render tick syncs sprite positions from
 * engine objects with camera offsets applied.
 */

import { Application, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import type { GameEngine } from './GameEngine';
import type { Camera } from './Camera';
import type { Unit } from '../objects/Unit';
import type { Projectile } from '../objects/Projectile';
import type { Effect } from '../objects/Effect';
import { areEnemies } from './teams';
import type { TeamId } from './teams';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainRenderer } from '../terrain/TerrainRenderer';

/** Color for allied unit glows. */
const ALLY_GLOW_COLOR = 0x22c55e; // green-500
/** Color for enemy unit glows. */
const ENEMY_GLOW_COLOR = 0xef4444; // red-500
/** Glow radius around units. */
const GLOW_RADIUS = 6;
/** Color for move target markers. */
const MOVE_TARGET_COLOR = 0x000000

export class GameRenderer {
    app: Application;
    private gameContainer: Container;
    private unitVisuals: Map<string, Container> = new Map();
    private moveTargetVisuals: Map<string, Graphics> = new Map();
    private projectileVisuals: Map<string, Graphics> = new Map();
    private effectVisuals: Map<string, Graphics> = new Map();
    private initialized: boolean = false;

    /** The team ID used to determine friend/foe glow colors. */
    localTeamId: TeamId = 'player';

    /** Terrain renderer (builds and caches the terrain sprite). */
    private terrainRenderer: TerrainRenderer = new TerrainRenderer();
    private terrainSprite: Sprite | null = null;
    private pendingTerrainGrid: TerrainGrid | null = null;

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
        this.initialized = true;

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
    }

    /** Resize the renderer (e.g. on window resize). */
    resize(width: number, height: number): void {
        if (!this.initialized) return;
        this.app.renderer.resize(width, height);
    }

    /** Main render call: sync all visuals with engine state. */
    render(engine: GameEngine, camera: Camera): void {
        if (!this.initialized) return;

        // Update game container offset (camera)
        this.gameContainer.x = -camera.x + camera.viewportWidth / 2;
        this.gameContainer.y = -camera.y + camera.viewportHeight / 2;

        this.renderUnits(engine.units);
        this.renderMoveTargets(engine.units);
        this.renderProjectiles(engine.projectiles);
        this.renderEffects(engine.effects);
        this.cleanupStaleVisuals(engine);
    }

    // ========================================================================
    // Units
    // ========================================================================

    private renderUnits(units: Unit[]): void {
        for (const unit of units) {
            let visual = this.unitVisuals.get(unit.id);
            if (!visual) {
                visual = this.createUnitVisual(unit);
                this.unitVisuals.set(unit.id, visual);
                this.gameContainer.addChild(visual);
            }
            visual.x = unit.x;
            visual.y = unit.y;
            visual.visible = unit.active;

            // Update HP bar
            this.updateUnitHpBar(visual, unit);
        }
    }

    private createUnitVisual(unit: Unit): Container {
        const container = new Container();

        // Glow circle
        const glow = new Graphics();
        const isEnemy = areEnemies(this.localTeamId, unit.teamId);
        const glowColor = isEnemy ? ENEMY_GLOW_COLOR : ALLY_GLOW_COLOR;

        glow.circle(0, 0, unit.radius + GLOW_RADIUS);
        glow.fill({ color: glowColor, alpha: 0.3 });
        glow.label = 'glow';
        container.addChild(glow);

        // Player color ring (if player-owned)
        if (unit.isPlayerControlled()) {
            const playerRing = new Graphics();
            playerRing.circle(0, 0, unit.radius + 2);
            playerRing.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
            playerRing.label = 'playerRing';
            container.addChild(playerRing);
        }

        // Body circle
        const body = new Graphics();
        const bodyColor = this.getUnitColor(unit);
        body.circle(0, 0, unit.radius);
        body.fill(bodyColor);
        body.stroke({ color: 0x000000, width: 1 });
        body.label = 'body';
        container.addChild(body);

        // Character initial label
        const style = new TextStyle({
            fontSize: 14,
            fontWeight: 'bold',
            fill: 0xffffff,
        });
        const label = new Text({ text: unit.name.charAt(0).toUpperCase(), style });
        label.anchor.set(0.5, 0.5);
        label.label = 'label';
        container.addChild(label);

        // HP bar background
        const hpBg = new Graphics();
        hpBg.rect(-unit.radius, -unit.radius - 10, unit.radius * 2, 6);
        hpBg.fill({ color: 0x333333, alpha: 0.8 });
        hpBg.label = 'hpBg';
        container.addChild(hpBg);

        // HP bar fill
        const hpFill = new Graphics();
        hpFill.label = 'hpFill';
        container.addChild(hpFill);

        return container;
    }

    private updateUnitHpBar(visual: Container, unit: Unit): void {
        const hpFill = visual.children.find((c) => c.label === 'hpFill') as Graphics | undefined;
        if (!hpFill) return;
        hpFill.clear();
        const ratio = unit.hp / unit.maxHp;
        const barWidth = unit.radius * 2 * ratio;
        const barColor = ratio > 0.5 ? 0x22c55e : ratio > 0.25 ? 0xeab308 : 0xef4444;
        hpFill.rect(-unit.radius, -unit.radius - 10, barWidth, 6);
        hpFill.fill(barColor);
    }

    private getUnitColor(unit: Unit): number {
        switch (unit.characterId) {
            case 'warrior': return 0x8b0000;
            case 'mage': return 0x4a148c;
            case 'ranger': return 0x2e7d32;
            case 'healer': return 0xf5f5dc;
            default: return 0x555555;
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
    // Projectiles
    // ========================================================================

    private renderProjectiles(projectiles: Projectile[]): void {
        for (const proj of projectiles) {
            let visual = this.projectileVisuals.get(proj.id);
            if (!visual) {
                visual = new Graphics();
                visual.circle(0, 0, proj.radius);
                visual.fill(0xc0c0c0);
                visual.stroke({ color: 0xffffff, width: 1 });
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
                visual = new Graphics();
                this.effectVisuals.set(effect.id, visual);
                this.gameContainer.addChild(visual);
            }
            visual.clear();
            visual.x = effect.x;
            visual.y = effect.y;
            visual.visible = effect.active;

            // Simple expanding ring effect
            const alpha = 1 - effect.progress;
            const radius = 10 + effect.progress * 30;
            visual.circle(0, 0, radius);
            visual.stroke({ color: 0xffd700, width: 2, alpha });
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
        for (const visual of this.unitVisuals.values()) visual.destroy();
        for (const visual of this.moveTargetVisuals.values()) visual.destroy();
        for (const visual of this.projectileVisuals.values()) visual.destroy();
        for (const visual of this.effectVisuals.values()) visual.destroy();
        this.unitVisuals.clear();
        this.moveTargetVisuals.clear();
        this.projectileVisuals.clear();
        this.effectVisuals.clear();
        this.terrainRenderer.destroy();
        this.terrainSprite = null;
        this.gameContainer.destroy();
        this.app.destroy();
        this.initialized = false;
    }
}
