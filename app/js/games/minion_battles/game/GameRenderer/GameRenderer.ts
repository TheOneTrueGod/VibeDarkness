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
import type { TerrainManager } from '../../terrain/TerrainManager';
import { TerrainRenderer } from '../../terrain/TerrainRenderer';
import type { DamageTakenEvent, TerrainStoneDamagedEvent } from '../EventBus';
import type { AbilityStatic } from '../../abilities/Ability';
import type { ResolvedTarget, GhostPlanData } from '../types';
import { AssetRegistry } from './AssetRegistry';
import { UnitRenderer } from './renderers/UnitRenderer';
import { OverlayRenderer } from './renderers/OverlayRenderer';
import { SpecialTileRenderer } from './renderers/SpecialTileRenderer';
import { ProjectileRenderer } from './renderers/ProjectileRenderer';
import { EffectRenderer } from './renderers/EffectRenderer';
import { LightSourceRenderer } from './renderers/LightSourceRenderer';
import { PreviewRenderer } from './renderers/PreviewRenderer';
import { TerrainEffectRenderer } from './renderers/TerrainEffectRenderer';
import { FloorTileRenderer } from './renderers/FloorTileRenderer';
import { MapNetworkRenderer } from './renderers/MapNetworkRenderer';
import { isRenderLayerVisible } from '../../../../debug/renderVisibilityStore';
import {
	PERF_UI,
	PERF_UI_CANVAS,
	PERF_UI_CANVAS_EFFECTS,
	PERF_UI_CANVAS_FLOOR_TILES,
	PERF_UI_CANVAS_LIGHT_SOURCES,
	PERF_UI_CANVAS_MAP_NETWORK,
	PERF_UI_CANVAS_OVERLAY,
	PERF_UI_CANVAS_PREVIEWS,
	PERF_UI_CANVAS_PROJECTILES,
	PERF_UI_CANVAS_SPECIAL_TILES,
	PERF_UI_CANVAS_TERRAIN,
	PERF_UI_CANVAS_TERRAIN_EFFECTS,
	PERF_UI_CANVAS_UNITS,
	tickPerformanceTracker,
} from '../performance/tickPerformanceTracker';
import { presentPixiApplicationWithTiming } from './pixiPresentWithTiming';

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
	private terrainEffectRenderer!: TerrainEffectRenderer;
	private floorTileRenderer!: FloorTileRenderer;
	private mapNetworkRenderer!: MapNetworkRenderer;

	/** Optional debug: draw a yellow outline around this unit. */
	private debugUnitOutlineId: string | null = null;

	/** The team ID used to determine friend/foe glow colors. */
	localTeamId: TeamId = 'player';

	/** Terrain renderer (builds and caches the terrain sprite). */
	private readonly terrainRenderer: TerrainRenderer = new TerrainRenderer();
	private terrainSprite: Sprite | null = null;
	private pendingTerrainManager: TerrainManager | null = null;
	/** Mission light config. Defaults: enabled true, global 0. */
	private lightLevelEnabled: boolean = true;

	/** Engine whose eventBus is subscribed to `damage_taken` (must rebind when the engine instance changes). */
	private eventBusSource: GameEngine | null = null;
	private readonly damageTakenBound = (data: DamageTakenEvent) => this.unitRenderer.onDamageTaken(data);
	private readonly terrainStoneDamagedBound = (e: TerrainStoneDamagedEvent) =>
		this.terrainRenderer.invalidateTile(e.col, e.row);

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
		engine.eventBus.off('terrain_stone_damaged', this.terrainStoneDamagedBound);
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
		this.floorTileRenderer = new FloorTileRenderer(this.gameContainer);
		this.terrainEffectRenderer = new TerrainEffectRenderer(this.gameContainer);
		this.mapNetworkRenderer = new MapNetworkRenderer(this.gameContainer);

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
		// Stop the PixiJS auto-ticker so the GPU flush is driven only by our RAF loop.
		// Without this the ticker flushes independently and can present a stale frame
		// when the main thread is busy with simulation.
		this.app.ticker.stop();

		// Build terrain sprite if it was queued before init completed
		if (this.pendingTerrainManager) {
			this.buildTerrainSprite(this.pendingTerrainManager);
			this.pendingTerrainManager = null;
		}
	}

	/**
	 * Set the terrain to render. If the renderer is already initialized,
	 * builds the sprite immediately; otherwise queues it for after init.
	 */
	setTerrain(tm: TerrainManager): void {
		if (this.initialized) {
			this.buildTerrainSprite(tm);
		} else {
			this.pendingTerrainManager = tm;
		}
	}

	/** Set mission light config. Defaults: enabled true, global 0. */
	setMissionLightConfig(lightLevelEnabled: boolean, globalLightLevel: number): void {
		this.lightLevelEnabled = lightLevelEnabled;
		if (this.initialized) this.overlayRenderer.setLightConfig(lightLevelEnabled);
		void globalLightLevel; // engine.state.globalLightLevel is used in the overlay directly
	}

	/** Build the cached terrain sprite and add it at the bottom of the scene. */
	private buildTerrainSprite(tm: TerrainManager): void {
		if (this.terrainSprite) {
			this.gameContainer.removeChild(this.terrainSprite);
		}

		this.terrainSprite = this.terrainRenderer.buildSprite(tm);
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
			ghostPlans?: Record<string, GhostPlanData>;
		} | null,
		realDt?: number,
	): void {
		if (!this.initialized) return;

		tickPerformanceTracker.measure([PERF_UI, PERF_UI_CANVAS], () => {
			if (engine !== this.eventBusSource) {
				if (this.eventBusSource) {
					this.eventBusSource.eventBus.off('damage_taken', this.damageTakenBound);
					this.eventBusSource.eventBus.off('terrain_stone_damaged', this.terrainStoneDamagedBound);
				}
				this.eventBusSource = engine;
				if (engine) {
					engine.eventBus.on('damage_taken', this.damageTakenBound);
					engine.eventBus.on('terrain_stone_damaged', this.terrainStoneDamagedBound);
				}
				this.unitRenderer.clearHitFlashes();
				this.overlayRenderer.reset();
			}

			// Update game container offset and scale (camera + zoom)
			this.gameContainer.scale.set(camera.zoom);
			this.gameContainer.x = -camera.x * camera.zoom + camera.viewportWidth / 2;
			this.gameContainer.y = -camera.y * camera.zoom + camera.viewportHeight / 2;

			tickPerformanceTracker.measure([PERF_UI_CANVAS_TERRAIN], () => {
				if (engine.terrainManager && isRenderLayerVisible('terrain')) {
					this.terrainRenderer.update(engine.terrainManager);
				}
				if (this.terrainSprite) {
					this.terrainSprite.visible = isRenderLayerVisible('terrain');
				}
			});

			tickPerformanceTracker.measure([PERF_UI_CANVAS_OVERLAY], () => {
				const overlayVisible = isRenderLayerVisible('overlay');
				this.overlayRenderer.setLayerVisible(overlayVisible);
				if (overlayVisible) {
					this.overlayRenderer.render(engine);
				}
			});

			tickPerformanceTracker.measure([PERF_UI_CANVAS_FLOOR_TILES], () => {
				const floorTilesVisible = isRenderLayerVisible('floorTiles');
				this.floorTileRenderer.setLayerVisible(floorTilesVisible);
				if (floorTilesVisible) {
					this.floorTileRenderer.render(engine);
				}
			});

			tickPerformanceTracker.measure([PERF_UI_CANVAS_TERRAIN_EFFECTS], () => {
				const terrainEffectsVisible = isRenderLayerVisible('terrainEffects');
				this.terrainEffectRenderer.setLayerVisible(terrainEffectsVisible);
				if (terrainEffectsVisible) {
					this.terrainEffectRenderer.render(engine);
				}
			});

			tickPerformanceTracker.measure([PERF_UI_CANVAS_UNITS], () => {
				const unitsVisible = isRenderLayerVisible('units');
				this.unitRenderer.setLayerVisible(unitsVisible);
				if (unitsVisible) {
					this.unitRenderer.render(engine, this.localTeamId, this.debugUnitOutlineId);
				}
			});

			tickPerformanceTracker.measure([PERF_UI_CANVAS_SPECIAL_TILES], () => {
				const specialTilesVisible = isRenderLayerVisible('specialTiles');
				this.specialTileRenderer.setLayerVisible(specialTilesVisible);
				if (specialTilesVisible) {
					this.specialTileRenderer.render(engine.specialTiles);
				}
			});

			tickPerformanceTracker.measure([PERF_UI_CANVAS_LIGHT_SOURCES], () => {
				const lightSourcesVisible = isRenderLayerVisible('lightSources');
				this.lightSourceRenderer.setLayerVisible(lightSourcesVisible);
				if (lightSourcesVisible) {
					this.lightSourceRenderer.render(engine);
				}
			});

			tickPerformanceTracker.measure([PERF_UI_CANVAS_PROJECTILES], () => {
				const projectilesVisible = isRenderLayerVisible('projectiles');
				this.projectileRenderer.setLayerVisible(projectilesVisible);
				if (projectilesVisible) {
					this.projectileRenderer.render(engine.projectiles, engine.gameTime);
				}
			});

			tickPerformanceTracker.measure([PERF_UI_CANVAS_EFFECTS], () => {
				const effectsVisible = isRenderLayerVisible('effects');
				this.effectRenderer.setLayerVisible(effectsVisible);
				if (effectsVisible) {
					this.effectRenderer.render(engine.effects);
				}
			});

			tickPerformanceTracker.measure([PERF_UI_CANVAS_PREVIEWS], () => {
				const previewsVisible = isRenderLayerVisible('previews');
				this.previewRenderer.setLayerVisible(previewsVisible);
				if (previewsVisible) {
					this.previewRenderer.render(engine, this.localTeamId, targetingState ?? null);
				}
			});

			tickPerformanceTracker.measure([PERF_UI_CANVAS_MAP_NETWORK], () => {
				const mapNetworkVisible = isRenderLayerVisible('mapNetwork');
				this.mapNetworkRenderer.setLayerVisible(mapNetworkVisible);
				if (mapNetworkVisible) {
					this.mapNetworkRenderer.render(engine);
				}
			});

			// Pixi stage → GPU/canvas flush (not the CPU layer sync above).
			presentPixiApplicationWithTiming(this.app);
		});
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
		this.floorTileRenderer.destroy();
		this.terrainEffectRenderer.destroy();
		this.mapNetworkRenderer.destroy();
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
