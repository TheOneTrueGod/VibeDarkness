/**
 * GameRenderer - Bridges the game engine state to PixiJS visuals.
 *
 * Maintains a PixiJS Application and a map of visual containers for
 * each game object. Each render tick syncs sprite positions from
 * engine objects with camera offsets applied.
 */

import { Application, Container } from 'pixi.js';
import type { Sprite } from 'pixi.js';
import { WAIT_FOR_ALL_ASSETS_TO_LOAD_BEFORE_GAME_START } from '../../../../gameConstants';
import type { GameEngine } from '../GameEngine';
import type { Camera } from '../Camera';
import type { TeamId } from '../teams';
import type { TerrainGrid } from '../../terrain/TerrainGrid';
import { TerrainRenderer } from '../../terrain/TerrainRenderer';
import type { DamageTakenEvent } from '../EventBus';
import type { AbilityStatic } from '../../abilities/Ability';
import type { ResolvedTarget } from '../types';
import { AssetRegistry } from './AssetRegistry';
import { UnitRenderer } from './renderers/UnitRenderer';
import { OverlayRenderer } from './renderers/OverlayRenderer';
import { SpecialTileRenderer } from './renderers/SpecialTileRenderer';
import { ProjectileRenderer } from './renderers/ProjectileRenderer';
import { EffectRenderer } from './renderers/EffectRenderer';
import { LightSourceRenderer } from './renderers/LightSourceRenderer';
import { PreviewRenderer } from './renderers/PreviewRenderer';

export class GameRenderer {
	app: Application;
	private gameContainer: Container;
	private initialized: boolean = false;
	/** Deduplicates concurrent `init` (e.g. React Strict Mode). */
	private initInFlight: Promise<void> | null = null;

	/** Sub-renderer instances (instantiated in performCanvasInit). */
	private assetRegistry!: AssetRegistry;
	private unitRenderer!: UnitRenderer;
	private overlayRenderer!: OverlayRenderer;
	private specialTileRenderer!: SpecialTileRenderer;
	private projectileRenderer!: ProjectileRenderer;
	private effectRenderer!: EffectRenderer;
	private lightSourceRenderer!: LightSourceRenderer;
	private previewRenderer!: PreviewRenderer;

	/** Optional debug: draw a yellow outline around this unit. */
	private debugUnitOutlineId: string | null = null;

	/** The team ID used to determine friend/foe glow colors. */
	localTeamId: TeamId = 'player';

	/** Terrain renderer (builds and caches the terrain sprite). */
	private readonly terrainRenderer: TerrainRenderer = new TerrainRenderer();
	private terrainSprite: Sprite | null = null;
	private pendingTerrainGrid: TerrainGrid | null = null;
	/** Mission light config. Defaults: enabled true, global 0. */
	private lightLevelEnabled: boolean = true;

	/** Engine whose eventBus is subscribed to `damage_taken` (must rebind when the engine instance changes). */
	private eventBusSource: GameEngine | null = null;
	private readonly damageTakenBound = (data: DamageTakenEvent) => this.unitRenderer.onDamageTaken(data);

	constructor() {
		this.app = new Application();
		this.gameContainer = new Container();
	}

	/** Set the debug unit outline target (or null to clear). */
	setDebugUnitOutline(unitId: string | null): void {
		this.debugUnitOutlineId = unitId;
		if (this.initialized) this.unitRenderer.setDebugUnitOutline(unitId);
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
		this.unitRenderer.clearHitFlashes();
		this.overlayRenderer.reset();
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

		this.assetRegistry = new AssetRegistry();
		this.overlayRenderer = new OverlayRenderer(this.gameContainer, this.assetRegistry);
		this.unitRenderer = new UnitRenderer(this.gameContainer, this.assetRegistry, this.overlayRenderer);
		this.specialTileRenderer = new SpecialTileRenderer(this.gameContainer, this.assetRegistry);
		this.projectileRenderer = new ProjectileRenderer(this.gameContainer, this.assetRegistry);
		this.effectRenderer = new EffectRenderer(this.gameContainer, this.assetRegistry);
		this.lightSourceRenderer = new LightSourceRenderer(this.gameContainer, this.assetRegistry);
		this.previewRenderer = new PreviewRenderer(this.gameContainer, this.assetRegistry, this.overlayRenderer);

		const afterLoad = (): void => {
			const tex = this.assetRegistry.getEffectTexture('darkBlob');
			if (tex) this.effectRenderer.setParticleTexture(tex);
		};

		if (WAIT_FOR_ALL_ASSETS_TO_LOAD_BEFORE_GAME_START) {
			await this.assetRegistry.load();
			afterLoad();
		} else {
			void this.assetRegistry.load().then(afterLoad);
		}

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

	/** Set mission light config. Defaults: enabled true, global 0. */
	setMissionLightConfig(lightLevelEnabled: boolean, globalLightLevel: number): void {
		this.lightLevelEnabled = lightLevelEnabled;
		if (this.initialized) this.overlayRenderer.setLightConfig(lightLevelEnabled);
		void globalLightLevel; // engine.state.globalLightLevel is used in the overlay directly
	}

	/** Build the cached terrain sprite and add it at the bottom of the scene. */
	private buildTerrainSprite(terrainGrid: TerrainGrid): void {
		if (this.terrainSprite) {
			this.gameContainer.removeChild(this.terrainSprite);
		}

		this.terrainSprite = this.terrainRenderer.buildSprite(terrainGrid);
		this.terrainSprite.zIndex = 0;
		this.gameContainer.addChildAt(this.terrainSprite, 0);

		this.overlayRenderer.initSprites(this.lightLevelEnabled);
	}

	/** Resize the renderer (e.g. on window resize). */
	resize(width: number, height: number): void {
		if (!this.initialized) return;
		this.app.renderer.resize(width, height);
	}

	/** Main render call: sync all visuals with engine state. */
	render(
		engine: GameEngine,
		camera: Camera,
		targetingState?: {
			selectedAbility: AbilityStatic | null;
			currentTargets: ResolvedTarget[];
			mouseWorld: { x: number; y: number };
			waitingForOrders: { unitId?: string } | null;
			previewOrderUnitId?: string | null;
		} | null,
	): void {
		if (!this.initialized) return;

		if (engine !== this.eventBusSource) {
			if (this.eventBusSource) {
				this.eventBusSource.eventBus.off('damage_taken', this.damageTakenBound);
			}
			this.eventBusSource = engine;
			if (engine) {
				engine.eventBus.on('damage_taken', this.damageTakenBound);
			}
			this.unitRenderer.clearHitFlashes();
			this.overlayRenderer.reset();
		}

		// Update game container offset and scale (camera + zoom)
		this.gameContainer.scale.set(camera.zoom);
		this.gameContainer.x = -camera.x * camera.zoom + camera.viewportWidth / 2;
		this.gameContainer.y = -camera.y * camera.zoom + camera.viewportHeight / 2;

		this.overlayRenderer.render(engine);
		this.unitRenderer.render(engine, this.localTeamId, this.debugUnitOutlineId);
		this.specialTileRenderer.render(engine.specialTiles);
		this.lightSourceRenderer.render(engine);
		this.projectileRenderer.render(engine.projectiles, engine.gameTime);
		this.effectRenderer.render(engine.effects);
		this.previewRenderer.render(engine, this.localTeamId, targetingState ?? null);
	}

	/** Full cleanup. Idempotent: safe to call multiple times. */
	destroy(): void {
		if (!this.initialized) return;
		if (this.eventBusSource) {
			this.eventBusSource.eventBus.off('damage_taken', this.damageTakenBound);
			this.eventBusSource = null;
		}
		this.terrainRenderer.destroy();
		this.terrainSprite = null;
		this.assetRegistry.destroy();
		this.unitRenderer.destroy();
		this.overlayRenderer.destroy();
		this.specialTileRenderer.destroy();
		this.projectileRenderer.destroy();
		this.effectRenderer.destroy();
		this.lightSourceRenderer.destroy();
		this.previewRenderer.destroy();
		this.gameContainer.destroy();
		this.initInFlight = null;
		this.app.destroy();
		this.initialized = false;
	}
}
