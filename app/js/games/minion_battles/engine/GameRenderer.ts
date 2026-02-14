/**
 * GameRenderer - Bridges the game engine state to PixiJS visuals.
 *
 * Maintains a PixiJS Application and a map of visual containers for
 * each game object. Each render tick syncs sprite positions from
 * engine objects with camera offsets applied.
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameEngine } from './GameEngine';
import type { Camera } from './Camera';
import type { Unit } from '../objects/Unit';
import type { Projectile } from '../objects/Projectile';
import type { Effect } from '../objects/Effect';
import { areEnemies } from './teams';
import type { TeamId } from './teams';

/** Color for allied unit glows. */
const ALLY_GLOW_COLOR = 0x22c55e; // green-500
/** Color for enemy unit glows. */
const ENEMY_GLOW_COLOR = 0xef4444; // red-500
/** Glow radius around units. */
const GLOW_RADIUS = 6;

export class GameRenderer {
    app: Application;
    private gameContainer: Container;
    private unitVisuals: Map<string, Container> = new Map();
    private projectileVisuals: Map<string, Graphics> = new Map();
    private effectVisuals: Map<string, Graphics> = new Map();
    private initialized: boolean = false;

    /** The team ID used to determine friend/foe glow colors. */
    localTeamId: TeamId = 'player';

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
        for (const visual of this.projectileVisuals.values()) visual.destroy();
        for (const visual of this.effectVisuals.values()) visual.destroy();
        this.unitVisuals.clear();
        this.projectileVisuals.clear();
        this.effectVisuals.clear();
        this.gameContainer.destroy();
        this.app.destroy();
        this.initialized = false;
    }
}
