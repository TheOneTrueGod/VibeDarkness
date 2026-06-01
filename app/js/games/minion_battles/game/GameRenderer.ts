/**
 * GameRenderer - Bridges the game engine state to PixiJS visuals.
 *
 * Maintains a PixiJS Application and a map of visual containers for
 * each game object. Each render tick syncs sprite positions from
 * engine objects with camera offsets applied.
 */

import { Application, Assets, Container, Graphics, Particle, ParticleContainer, Sprite, Texture } from 'pixi.js';
import { DarknessLevel } from './darknessLevels';
import { type FogFilter, tryCreateFogFilter } from './FogFilter';
import { WAIT_FOR_ALL_ASSETS_TO_LOAD_BEFORE_GAME_START } from '../../../gameConstants';
import type { GameEngine } from './GameEngine';
import type { Camera } from './Camera';
import type { Unit } from './units/Unit';
import { getAbility } from '../abilities/AbilityRegistry';
import { normalizeAbilityTimingsToIntervals, resolveAbilityTimingEntries, getEffectiveCastBehaviours } from '../abilities/abilityTimings';
import { resolveBehaviourTimingRef } from '../abilities/castBehaviourTypes';
import type { AbilityStatic } from '../abilities/Ability';
import { getSelectTargetDefsFromTimings, filterSelectTargetCandidates } from '../abilities/targeting';
import { renderMeleeTrackingHighlights } from '../abilities/meleeTrackingHelpers';
import { Projectile } from './projectiles/Projectile';
import type { Effect } from './effects/Effect';
import { areEnemies } from './teams';
import { UnitTag } from './units/unitTag';
import type { TeamId } from './teams';
import type { TerrainGrid } from '../terrain/TerrainGrid';
import { CELL_SIZE } from '../terrain/TerrainGrid';
import { TerrainRenderer } from '../terrain/TerrainRenderer';
import {
	renderUnit,
	updateUnitHpBar,
	getBodyColorForUnit,
	syncUnitCharacterSpriteIfNeeded,
	CHARACTER_SPRITE_SCALE,
	type IUnitRenderContext,
} from './units/unit_defs/unitDef';
import { getBuffVisualRenderer } from '../buffs/buffVisuals';
import { createEffectVisual, updateEffectVisual, type IEffectRenderContext } from './effect_defs/index';
import { EFFECT_IMAGE_SOURCES, type EffectImageKey } from './effectImages';
import { getSpecialTileDef } from '../storylines/specialTileDefs';
import type { SpecialTile } from './specialTiles/SpecialTile';
import type { DamageTakenEvent } from './EventBus';
import { debugSettingsSnapshot } from '../../../debug/debugSettingsStore';
import { getPortraitIds, PORTRAITS } from '../character_defs/portraitLoader';
import type { ResolvedTarget } from './types';

/** Hit flash duration in seconds (real time, not affected by pause). */
const HIT_FLASH_DURATION = 0.3;

/** Color for move target markers (dark gray so visible in darkness). */
const MOVE_TARGET_COLOR = 0x333333;

/** Light background stroke for move target paths for readability on all terrain. */
const MOVE_TARGET_PATH_BG_COLOR = 0xffffff;

/** Opacity for pending-order and enemy-movement ghost overlays (whole layer). */
const GHOST_PREVIEW_LAYER_ALPHA = 0.5;

/** Z-index constants for game container layers (lower = behind). */
const Z_INDEX = {
	terrain: 0,
	crystalAura: 2,
	darkness: 5,
	specialTiles: 6,
	moveTargets: 7,
	ghostPreview: 8,
	knockbackShadow: 9,
	units: 10,
	projectiles: 11,
	effects: 12,
	fogTint: 13,
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
/** Lanternite character sprite (venus flytrap motif). */
const LANTERNITE_SVG_URL = new URL('../assets/characters/lanternite.svg', import.meta.url).href;
/** Lanternite nest character sprite (bud motif). */
const LANTERNITE_NEST_SVG_URL = new URL('../assets/characters/lanternite_nest.svg', import.meta.url).href;

export class GameRenderer {
	app: Application;
	private gameContainer: Container;
	private unitVisuals: Map<string, Container> = new Map();
	private knockbackShadowVisuals: Map<string, Graphics> = new Map();
	private moveTargetVisuals: Map<string, Graphics> = new Map();
	private projectileVisuals: Map<string, Graphics> = new Map();
	private effectVisuals: Map<string, Container> = new Map();
	/** PixiJS v8 ParticleContainer for high-count sprite-based effects (ParticleImage, StoryHomingParticle). */
	private particleContainer: ParticleContainer | null = null;
	/** Particle objects for particle-type effects, keyed by effect ID. */
	private particleEffects: Map<string, Particle> = new Map();
	private lightSourceVisuals: Map<string, Graphics> = new Map();
	/** Ghost nest visuals for scouts currently building (keyed by scout unit ID). */
	private constructionGhostVisuals: Map<string, Container> = new Map();
	private abilityPreviewGraphics: Graphics = new Graphics();
	private targetingPreviewGraphics: Graphics = new Graphics();
	/** Pending orders + enemy movement paths (lighter than live player move targets). */
	private ghostPreviewGraphics: Graphics = new Graphics();
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
	/** Cached texture for lanternite character sprite. */
	private lanterniteTexture: Texture | null = null;
	/** Cached texture for lanternite nest character sprite. */
	private lanterniteNestTexture: Texture | null = null;
	/** Preloaded player portrait textures (portrait ID → texture). */
	private playerPortraitTextures: Map<string, Texture> = new Map();
	/** Cached texture for Campfire. */
	private campfireTexture: Texture | null = null;

	/** Cached textures for effect sprites (ParticleImage, etc.). */
	private effectTextures: Partial<Record<EffectImageKey, Texture>> = {};

	/** Mission light config. Defaults: enabled true, global 0. */
	private lightLevelEnabled: boolean = true;
	private globalLightLevel: number = 0;
	/** Darkness overlay (above terrain, below special tiles). Only visible when light enabled. */
	private darknessOverlaySprite: Sprite | null = null;
	/** Unfiltered tint sprite above units — same texture at low alpha for immersive fog feel. */
	private fogTintSprite: Sprite | null = null;
	/** Animated fog shader applied to the darkness overlay. Null if GPU doesn't support it. */
	private fogFilter: FogFilter | null = null;
	/** gameTick of the last darkness overlay redraw; redraw whenever tick advances. */
	private lastOverlayTick: number = -1;
	/** Current light grid [row][col], for unit visibility. Set when light enabled. */
	private currentLightGrid: number[][] | null = null;
	/** performance.now() timestamp of the last render call, for fog animation delta-time. */
	private lastRenderTime: number = 0;

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
		this.lastOverlayTick = -1;
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
		this.ghostPreviewGraphics.zIndex = Z_INDEX.ghostPreview;
		this.gameContainer.addChild(this.ghostPreviewGraphics);

		this.particleContainer = new ParticleContainer({ dynamicProperties: { position: true, alpha: true, scale: true } });
		this.particleContainer.zIndex = Z_INDEX.effects;
		this.gameContainer.addChild(this.particleContainer);

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
		await load('lanternite SVG', LANTERNITE_SVG_URL, (t) => {
			this.lanterniteTexture = t;
		});
		await load('lanternite_nest SVG', LANTERNITE_NEST_SVG_URL, (t) => {
			this.lanterniteNestTexture = t;
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
		if (this.particleContainer && this.effectTextures.darkBlob) {
			this.particleContainer.texture = this.effectTextures.darkBlob;
		}

		for (const portraitId of getPortraitIds()) {
			const url = PORTRAITS[portraitId]?.battleModel.modelImageUrl;
			if (!url) continue;
			try {
				const tex = (await Assets.load(url)) as Texture;
				this.playerPortraitTextures.set(portraitId, tex);
			} catch (err) {
				console.warn('[GameRenderer] Failed to load portrait texture:', portraitId, err);
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

			this.fogFilter = tryCreateFogFilter();
			if (this.fogFilter) {
				this.fogFilter.fogStartAlpha = GameRenderer.lightLevelToAlpha(DarknessLevel.DARKNESS_FOG);
				this.darknessOverlaySprite.filters = [this.fogFilter];
			}

			this.fogTintSprite = new Sprite(this.darknessOverlaySprite.texture);
			this.fogTintSprite.label = 'fogTintOverlay';
			this.fogTintSprite.alpha = 0.15;
		}
		this.darknessOverlaySprite.zIndex = Z_INDEX.darkness;
		if (!this.darknessOverlaySprite.parent) {
			this.gameContainer.addChildAt(this.darknessOverlaySprite, 1);
		}
		this.darknessOverlaySprite.visible = this.lightLevelEnabled;

		if (this.fogTintSprite) {
			this.fogTintSprite.zIndex = Z_INDEX.fogTint;
			if (!this.fogTintSprite.parent) {
				this.gameContainer.addChild(this.fogTintSprite);
			}
			this.fogTintSprite.visible = this.lightLevelEnabled;
		}

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
		const LightLevel = Math.round(level);
		const lightAtMedium = 0.8
		
		if (LightLevel <= DarknessLevel.FULL_DARKNESS) return 1;
		if (LightLevel >= DarknessLevel.BRIGHT_LIGHT) return 0;
		if (LightLevel >= DarknessLevel.MEDIUM_LIGHT_MIN) return (1 - lightAtMedium);
		const baseDarkness = 0.2;
		const remainingDarkness = 1 - baseDarkness;
		const lightPctLerp = (LightLevel - DarknessLevel.FULL_DARKNESS) / (DarknessLevel.MEDIUM_LIGHT_MIN - DarknessLevel.FULL_DARKNESS);
		return 1 - (baseDarkness + remainingDarkness * lightPctLerp);
	}

	private updateDarknessOverlay(engine: GameEngine): void {
		const tileGrid = engine.state.lightTileGrid;
		const terrainGrid = engine.terrainManager!.grid;
		const width = terrainGrid.width;
		const height = terrainGrid.height;

		if (tileGrid) {
			if (!this.currentLightGrid || this.currentLightGrid.length !== height) {
				this.currentLightGrid = Array.from({ length: height }, () => new Array(width).fill(0));
			}
			for (let row = 0; row < height; row++)
				for (let col = 0; col < width; col++)
					this.currentLightGrid[row][col] = tileGrid.get(row, col);
		} else {
			this.currentLightGrid = null;
		}

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
					const level = this.currentLightGrid ? this.currentLightGrid[row][col] : this.globalLightLevel;
					const alpha = GameRenderer.lightLevelToAlpha(level);
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
		selectedAbility: AbilityStatic | null;
		currentTargets: ResolvedTarget[];
		mouseWorld: { x: number; y: number };
		waitingForOrders: { unitId?: string } | null;
		previewOrderUnitId?: string | null;
	} | null = null;

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
			this.lastOverlayTick = -1;
			this.currentLightGrid = null;
		}

		this.targetingState = targetingState ?? null;

		// Update game container offset and scale (camera + zoom)
		this.gameContainer.scale.set(camera.zoom);
		this.gameContainer.x = -camera.x * camera.zoom + camera.viewportWidth / 2;
		this.gameContainer.y = -camera.y * camera.zoom + camera.viewportHeight / 2;

		if (this.pendingUnitCharacterSpriteSync) {
			this.syncAllUnitCharacterSprites(engine);
			this.pendingUnitCharacterSpriteSync = false;
		}

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
			this.currentLightGrid = null;
			if (this.darknessOverlaySprite) this.darknessOverlaySprite.visible = false;
			if (this.fogTintSprite) this.fogTintSprite.visible = false;
			this.lastRenderTime = 0;
		}

		this.renderUnits(engine);
		this.renderConstructionGhosts(engine);
		this.renderCrystalAura(engine);
		this.renderDarkCrystalAura(engine);
		this.renderSpecialTiles(engine.specialTiles);
		this.renderMoveTargets(engine.units);
		this.renderGhostPreviews(engine);
		this.renderProjectiles(engine.projectiles);
		this.renderEffects(engine.effects);
		this.renderLightSources(engine);
		this.renderActiveAbilityPreviews(engine);
		this.renderTargetingPreview(engine);
		this.cleanupStaleVisuals(engine);
	}

	// ========================================================================
	// Lanternite construction ghosts
	// ========================================================================

	/**
	 * For each scout currently building a nest, render:
	 * - A translucent nest sprite (30% alpha) at the build site.
	 * - A green hollow circular arc showing construction progress (0→full circle).
	 */
	private renderConstructionGhosts(engine: GameEngine): void {
		const activeScoutIds = new Set<string>();
		/** Explicit radius from lanternite_nest unitDef. */
		const nestRadius = 28;

		for (const unit of engine.units) {
			if (!unit.isAlive()) continue;
			if (unit.lanterniteConstructionCompleteAtGameTime == null) continue;
			const targetPos = unit.lanternPatrolFarWorld;
			if (!targetPos) continue;

			activeScoutIds.add(unit.id);

			// Compute 0..1 progress from remaining time and total construction duration
			const totalSec = unit.lanterniteNestConfig?.scoutConstructionSec ?? 12;
			const remaining = Math.max(0, unit.lanterniteConstructionCompleteAtGameTime - engine.gameTime);
			const progress = Math.min(1, Math.max(0, 1 - remaining / totalSec));

			let ghost = this.constructionGhostVisuals.get(unit.id);
			if (!ghost) {
				ghost = new Container();
				ghost.label = 'constructionGhost';

				// Ghost nest sprite (30% alpha so the build site is previewed but not fully visible)
				const nestSprite = new Sprite(this.lanterniteNestTexture ?? Texture.EMPTY);
				nestSprite.label = 'ghostNestSprite';
				nestSprite.anchor.set(0.5, 0.5);
				const spriteSize = nestRadius * 2 * CHARACTER_SPRITE_SCALE;
				nestSprite.width = spriteSize;
				nestSprite.height = spriteSize;
				nestSprite.alpha = 0.3;
				ghost.addChild(nestSprite);

				// Circular progress arc drawn on top of the sprite
				const arcG = new Graphics();
				arcG.label = 'constructionArc';
				ghost.addChild(arcG);

				ghost.zIndex = Z_INDEX.units - 1;
				this.gameContainer.addChild(ghost);
				this.constructionGhostVisuals.set(unit.id, ghost);
			}

			ghost.visible = true;
			ghost.x = targetPos.x;
			ghost.y = targetPos.y;

			// Sync texture in case it loaded after the ghost was created
			const nestSprite = ghost.children.find((c) => c.label === 'ghostNestSprite') as Sprite | undefined;
			if (nestSprite && this.lanterniteNestTexture && nestSprite.texture !== this.lanterniteNestTexture) {
				nestSprite.texture = this.lanterniteNestTexture;
			}

			// Redraw progress arc each frame
			const arcG = ghost.children.find((c) => c.label === 'constructionArc') as Graphics | undefined;
			if (arcG) {
				arcG.clear();
				const arcRadius = nestRadius + 8; // slightly outside the nest body
				const startAngle = -Math.PI / 2; // 12 o'clock

				// Background ring (dark, so the track is visible in all lighting)
				arcG.arc(0, 0, arcRadius, 0, Math.PI * 2);
				arcG.stroke({ color: 0x064e3b, width: 3, alpha: 0.5 });

				// Filled progress arc (bright green, clockwise)
				if (progress > 0.01) {
					arcG.arc(0, 0, arcRadius, startAngle, startAngle + progress * Math.PI * 2);
					arcG.stroke({ color: 0x34d399, width: 3 });
				}
			}
		}

		// Remove ghosts whose scouts have finished or died
		for (const [id, ghost] of this.constructionGhostVisuals) {
			if (!activeScoutIds.has(id)) {
				this.gameContainer.removeChild(ghost);
				ghost.destroy();
				this.constructionGhostVisuals.delete(id);
			}
		}
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
				if (characterId === 'lanternite') return this.lanterniteTexture;
				if (characterId === 'lanternite_nest') return this.lanterniteNestTexture;
				return null;
			},
			getPlayerPortraitTexture: (portraitId: string) => this.playerPortraitTextures.get(portraitId) ?? null,
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
			let renderOffsetX = 0;
			let renderOffsetY = 0;
			for (const activeAbility of unit.activeAbilities) {
				const ability = getAbility(activeAbility.abilityId);
				if (!ability?.getCasterRenderOffset) continue;
				const offset = ability.getCasterRenderOffset(unit, activeAbility, engine.gameTime, engine);
				if (!offset) continue;
				renderOffsetX += offset.x;
				renderOffsetY += offset.y;
			}
			for (const activeAbility of unit.activeAbilities) {
				if (!activeAbility.castBehaviourPayloads) continue;
				const ability = getAbility(activeAbility.abilityId);
				if (!ability) continue;
				const intervals = normalizeAbilityTimingsToIntervals(
					resolveAbilityTimingEntries(ability, unit, engine),
				);
				for (let iIdx = 0; iIdx < intervals.length; iIdx++) {
					const interval = intervals[iIdx]!;
					const effectiveBehaviours = getEffectiveCastBehaviours(interval);
					if (!effectiveBehaviours) continue;
					for (let bIdx = 0; bIdx < effectiveBehaviours.length; bIdx++) {
						const entry = effectiveBehaviours[bIdx]!;
						if (!entry.behaviour.getCasterRenderOffset) continue;
						const elapsed = engine.gameTime - activeAbility.startTime;
						const windowStart = resolveBehaviourTimingRef(entry.timingStart, interval.start, interval.end);
						const windowEnd = entry.timingEnd !== undefined
							? resolveBehaviourTimingRef(entry.timingEnd, interval.start, interval.end)
							: windowStart;
						const windowLen = windowEnd - windowStart;
						const rawProgress = windowLen > 0 ? (elapsed - windowStart) / windowLen : 0;
						const windowProgress = Math.max(0, Math.min(1, rawProgress));
						// Only call if the window is active or just past
						if (elapsed < windowStart - 0.05 || elapsed > windowEnd + 0.05) continue;
						const behaviourKey = `${interval.id}_${bIdx}`;
						const behaviourPayload = activeAbility.castBehaviourPayloads[behaviourKey];
						const targetIdx = entry.targetIndex ?? 0;
						const target = activeAbility.targets[targetIdx] ?? activeAbility.targets[0];
						if (!target) continue;
						const offset = entry.behaviour.getCasterRenderOffset({
							caster: unit,
							abilityId: activeAbility.abilityId,
							target,
							allTargets: activeAbility.targets,
							castPayload: activeAbility.castPayload,
							behaviourPayload,
							setBehaviourPayload: () => { }, // no-op: render must not mutate simulation state
							gameTime: engine.gameTime,
							windowProgress,
						});
						if (offset) {
							renderOffsetX += offset.x;
							renderOffsetY += offset.y;
						}
					}
				}
			}
			// Knockback air arc: quadratic Y lift during the airborne phase only.
			let knockupYOffset = 0;
			let knockupMaxHeight = 0;
			if (unit.knockback !== null) {
				const kb = unit.knockback;
				const airTime = kb.knockbackAirTime;
				if (airTime > 0 && kb.knockbackElapsed < airTime) {
					const progress = kb.knockbackElapsed / airTime;
					const arcFactor = 4 * progress * (1 - progress);
					const vx = kb.knockbackVector.x;
					const vy = kb.knockbackVector.y;
					const magnitude = Math.sqrt(vx * vx + vy * vy);
					knockupMaxHeight = Math.min(magnitude * 0.25, 25);
					knockupYOffset = -arcFactor * knockupMaxHeight;
				}
			}

			// Shadow: rendered at ground level while unit is airborne, shrinking as unit rises.
			let knockbackShadow = this.knockbackShadowVisuals.get(unit.id);
			if (knockupYOffset < 0 && unit.active) {
				if (!knockbackShadow) {
					knockbackShadow = new Graphics();
					knockbackShadow.zIndex = Z_INDEX.knockbackShadow;
					this.knockbackShadowVisuals.set(unit.id, knockbackShadow);
					this.gameContainer.addChild(knockbackShadow);
				}
				knockbackShadow.visible = true;
				knockbackShadow.clear();
				const heightFraction = knockupMaxHeight > 0 ? -knockupYOffset / knockupMaxHeight : 0;
				const shadowScale = 1 - heightFraction * 0.65;
				const shadowRx = unit.radius * 1.1 * shadowScale;
				const shadowRy = unit.radius * 0.35 * shadowScale;
				knockbackShadow.ellipse(0, 0, shadowRx, shadowRy);
				knockbackShadow.fill({ color: 0x222222, alpha: 0.55 });
				knockbackShadow.x = unit.x;
				knockbackShadow.y = unit.y + unit.radius - 4;
			} else {
				if (knockbackShadow) knockbackShadow.visible = false;
			}

			visual.x = unit.x + renderOffsetX;
			visual.y = unit.y + renderOffsetY + knockupYOffset;
			visual.visible = unit.active && !unit.isSpawning();

			const col = Math.floor(unit.x / cellSize);
			const row = Math.floor(unit.y / cellSize);
			const light = this.getLightAt(col, row);
			const inFullDarkness =
				light !== null && light <= DarknessLevel.FULL_DARKNESS && areEnemies(this.localTeamId, unit.teamId);
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
				const darkTint = visual.children.find((c) => c.label === 'darkCreatureIconTint');
				if (darkTint) darkTint.visible = false;
				if (label) label.visible = false;
				if (glow) glow.visible = false;
				if (playerRing) playerRing.visible = false;
			} else {
				if (body) {
					body.clear();
					body.circle(0, 0, unit.radius);
					body.fill(getBodyColorForUnit(unit));
					body.stroke({ color: 0x000000, width: 1 });
					if (isDebugOutlined) {
						// Yellow outline for debug focus.
						body.stroke({ color: 0xfacc15, width: 3 });
						body.circle(0, 0, unit.radius + 4);
						body.stroke({ color: 0xfacc15, width: 2 });
					}
				}
				const showHpBar = !unit.isInvincible() && !unit.tags.includes(UnitTag.Boss) && !unit.isSpawning();
				if (hpBg) hpBg.visible = showHpBar;
				if (hpFill) hpFill.visible = showHpBar;
				if (characterSprite) characterSprite.visible = true;
				const darkTint = visual.children.find((c) => c.label === 'darkCreatureIconTint');
				if (darkTint) darkTint.visible = true;
				if (label) label.visible = true;
				if (glow) glow.visible = true;
				if (playerRing) playerRing.visible = true;
				if (showHpBar) updateUnitHpBar(visual, unit);
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

			// Crystal corruption bar: shows while unit is actively corrupting a crystal
			let crystalCorruptBar = visual.children.find((c) => c.label === 'crystalCorruptBar') as Graphics | undefined;
			if (unit.crystalCorruptionProgress > 0) {
				if (!crystalCorruptBar) {
					crystalCorruptBar = new Graphics();
					crystalCorruptBar.label = 'crystalCorruptBar';
					visual.addChild(crystalCorruptBar);
				}
				crystalCorruptBar.visible = true;
				crystalCorruptBar.clear();
				const w = 24;
				const h = 4;
				const y = -unit.radius - 20;
				crystalCorruptBar.rect(-w / 2, y, w, h);
				crystalCorruptBar.fill({ color: 0x332244 });
				crystalCorruptBar.rect(-w / 2, y, w * unit.crystalCorruptionProgress, h);
				crystalCorruptBar.fill({ color: 0x663399 });
				crystalCorruptBar.rect(-w / 2, y, w, h);
				crystalCorruptBar.stroke({ color: 0x9966cc, width: 1 });
			} else {
				if (crystalCorruptBar) crystalCorruptBar.visible = false;
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
		if (!container || !unit || unit.isInvincible()) return;
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

			this.drawPlayerMoveTargetPathWithCap(visual, unit.x, unit.y, unit.movement.path);
		}

		// Hide visuals for units that no longer have a move target
		for (const [key, visual] of this.moveTargetVisuals) {
			if (!activeIds.has(key)) {
				visual.visible = false;
			}
		}
	}

	/**
	 * Full-opacity move path + destination ring/dot (local player live preview).
	 */
	private drawPlayerMoveTargetPathWithCap(
		g: Graphics,
		originX: number,
		originY: number,
		path: { col: number; row: number }[],
	): void {
		g.moveTo(originX, originY);
		for (const cell of path) {
			const wx = cell.col * CELL_SIZE + CELL_SIZE / 2;
			const wy = cell.row * CELL_SIZE + CELL_SIZE / 2;
			g.lineTo(wx, wy);
		}
		g.stroke({ color: MOVE_TARGET_PATH_BG_COLOR, width: 3, alpha: 0.7 });

		g.moveTo(originX, originY);
		for (const cell of path) {
			const wx = cell.col * CELL_SIZE + CELL_SIZE / 2;
			const wy = cell.row * CELL_SIZE + CELL_SIZE / 2;
			g.lineTo(wx, wy);
		}
		g.stroke({ color: MOVE_TARGET_COLOR, width: 2 });

		const lastCell = path[path.length - 1];
		const destX = lastCell.col * CELL_SIZE + CELL_SIZE / 2;
		const destY = lastCell.row * CELL_SIZE + CELL_SIZE / 2;

		g.circle(destX, destY, 8);
		g.stroke({ color: MOVE_TARGET_PATH_BG_COLOR, width: 3, alpha: 0.7 });

		g.circle(destX, destY, 8);
		g.stroke({ color: MOVE_TARGET_COLOR, width: 2, alpha: 1 });

		g.circle(destX, destY, 2);
		g.fill({ color: MOVE_TARGET_PATH_BG_COLOR, alpha: 0.7 });

		g.circle(destX, destY, 2);
		g.fill({ color: MOVE_TARGET_COLOR, alpha: 1 });
	}

	/**
	 * Ghost previews: pending batch orders (movement + ability) and enemy AI movement routes.
	 * Whole layer uses {@link GHOST_PREVIEW_LAYER_ALPHA}; enemy paths omit the destination cap and
	 * fade the tail after the first two grid cells.
	 */
	private renderGhostPreviews(engine: GameEngine): void {
		this.ghostPreviewGraphics.clear();
		this.ghostPreviewGraphics.x = 0;
		this.ghostPreviewGraphics.y = 0;
		this.ghostPreviewGraphics.alpha = GHOST_PREVIEW_LAYER_ALPHA;

		const cellSize = CELL_SIZE;

		for (const unit of engine.units) {
			if (!unit.active || !unit.isAlive()) continue;
			if (!unit.movement || unit.movement.path.length === 0) continue;
			if (!areEnemies(this.localTeamId, unit.teamId)) continue;
			if (this.enemyUnitHiddenInFullDarkness(unit, cellSize)) continue;
			this.drawEnemyGhostMovePath(this.ghostPreviewGraphics, unit.x, unit.y, unit.movement.path);
		}

		const batch = engine.waitingForOrders;
		if (!batch) return;

		const previewGr = this.ghostPreviewGraphics as unknown as import('../abilities/Ability').IAbilityPreviewGraphics;

		for (const entry of engine.pendingOrders) {
			if (entry.gameTick !== batch.atTick) continue;
			const unit = engine.getUnit(entry.order.unitId);
			if (!unit?.active || !unit.isAlive()) continue;

			const path = entry.order.movePath;
			if (path && path.length > 0) {
				if (areEnemies(this.localTeamId, unit.teamId)) {
					if (!this.enemyUnitHiddenInFullDarkness(unit, cellSize)) {
						this.drawEnemyGhostMovePath(this.ghostPreviewGraphics, unit.x, unit.y, path);
					}
				} else {
					this.drawPlayerMoveTargetPathWithCap(this.ghostPreviewGraphics, unit.x, unit.y, path);
				}
			}

			const abilityId = entry.order.abilityId;
			if (abilityId === 'wait') continue;

			const ability = getAbility(abilityId);
			if (!ability) continue;
			if (areEnemies(this.localTeamId, unit.teamId) && this.enemyUnitHiddenInFullDarkness(unit, cellSize)) {
				continue;
			}

			const mouseWorld = this.mouseWorldForGhostAbilityPreview(
				entry.order.targets,
				engine,
				unit.x,
				unit.y,
			);

			// New-style: ability declares per-timing SelectTargetDef entries — auto-derive preview.
			const selectTargetDefs = getSelectTargetDefsFromTimings(ability);
			if (selectTargetDefs.length > 0) {
				// Render each committed target's hitbox.
				for (let i = 0; i < selectTargetDefs.length; i++) {
					const selectDef = selectTargetDefs[i]!;
					const target = entry.order.targets[i];
					if (!target) continue;
					const targetPos = target.type === 'unit' && target.unitId
						? (() => { const u = engine.getUnit(target.unitId!); return u ? { x: u.x, y: u.y } : null; })()
						: (target.type === 'pixel' && target.position ? target.position : null);
					if (!targetPos) continue;
					selectDef.hitbox.renderTargetingPreview(previewGr, unit, targetPos, engine.units);
				}
				continue;
			}

			// Legacy: fall through to ability.renderTargetingPreview.
			if (!ability.renderTargetingPreview) continue;
			ability.renderTargetingPreview(previewGr, unit, entry.order.targets, mouseWorld, engine.units, engine);
			if (ability.renderTargetingPreviewSelectedTargets) {
				ability.renderTargetingPreviewSelectedTargets(
					previewGr,
					unit,
					entry.order.targets,
					mouseWorld,
					engine.units,
					engine,
				);
			}
		}
	}

	private enemyUnitHiddenInFullDarkness(unit: Unit, cellSize: number): boolean {
		if (!areEnemies(this.localTeamId, unit.teamId) || !this.currentLightGrid) return false;
		const col = Math.floor(unit.x / cellSize);
		const row = Math.floor(unit.y / cellSize);
		const light = this.getLightAt(col, row);
		return light !== null && light <= DarknessLevel.FULL_DARKNESS;
	}

	private mouseWorldForGhostAbilityPreview(
		targets: ResolvedTarget[],
		engine: GameEngine,
		fallbackX: number,
		fallbackY: number,
	): { x: number; y: number } {
		for (const t of targets) {
			if (t.type === 'pixel' && t.position) {
				return { x: t.position.x, y: t.position.y };
			}
			if (t.type === 'unit' && t.unitId) {
				const u = engine.getUnit(t.unitId);
				if (u) return { x: u.x, y: u.y };
			}
		}
		return { x: fallbackX, y: fallbackY };
	}

	/**
	 * Enemy ghost: first two cells match player path strokes; remainder is a polyline that fades toward the end;
	 * no destination ring/dot.
	 */
	private drawEnemyGhostMovePath(
		g: Graphics,
		originX: number,
		originY: number,
		path: { col: number; row: number }[],
	): void {
		const cs = CELL_SIZE;
		const center = (col: number, row: number) => ({
			x: col * cs + cs / 2,
			y: row * cs + cs / 2,
		});

		const n = path.length;
		if (n === 0) return;

		const solidCellCount = Math.min(2, n);
		g.moveTo(originX, originY);
		for (let i = 0; i < solidCellCount; i++) {
			const p = center(path[i]!.col, path[i]!.row);
			g.lineTo(p.x, p.y);
		}
		g.stroke({ color: MOVE_TARGET_PATH_BG_COLOR, width: 3, alpha: 0.7 });

		g.moveTo(originX, originY);
		for (let i = 0; i < solidCellCount; i++) {
			const p = center(path[i]!.col, path[i]!.row);
			g.lineTo(p.x, p.y);
		}
		g.stroke({ color: MOVE_TARGET_COLOR, width: 2 });

		if (n < 3) return;

		const tailPoints: { x: number; y: number }[] = [];
		for (let i = 1; i < n; i++) {
			tailPoints.push(center(path[i]!.col, path[i]!.row));
		}

		let totalLen = 0;
		const segLens: number[] = [];
		for (let i = 0; i < tailPoints.length - 1; i++) {
			const a = tailPoints[i]!;
			const b = tailPoints[i + 1]!;
			const L = Math.hypot(b.x - a.x, b.y - a.y);
			segLens.push(L);
			totalLen += L;
		}
		if (totalLen <= 0) return;

		let traveled = 0;
		for (let i = 0; i < tailPoints.length - 1; i++) {
			const a = tailPoints[i]!;
			const b = tailPoints[i + 1]!;
			const len = segLens[i] ?? 0;
			const steps = Math.max(3, Math.ceil(len / 8));
			for (let s = 0; s < steps; s++) {
				const t0 = s / steps;
				const t1 = (s + 1) / steps;
				const mx0 = a.x + (b.x - a.x) * t0;
				const my0 = a.y + (b.y - a.y) * t0;
				const mx1 = a.x + (b.x - a.x) * t1;
				const my1 = a.y + (b.y - a.y) * t1;
				const midTravel = traveled + len * ((t0 + t1) / 2);
				const alphaTail = 0.88 * (1 - midTravel / totalLen) + 0.05;
				g.moveTo(mx0, my0);
				g.lineTo(mx1, my1);
				g.stroke({ color: MOVE_TARGET_PATH_BG_COLOR, width: 4, alpha: alphaTail * 0.65 });
				g.moveTo(mx0, my0);
				g.lineTo(mx1, my1);
				g.stroke({ color: MOVE_TARGET_COLOR, width: 2, alpha: alphaTail });
			}
			traveled += len;
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
				if (light !== null && light <= DarknessLevel.FULL_DARKNESS) continue;
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
		const previewUnitId = ts.previewOrderUnitId ?? ts.waitingForOrders?.unitId;
		if (!ability || !previewUnitId) {
			this.targetingPreviewGraphics.clear();
			return;
		}

		const caster = engine.getUnit(previewUnitId);
		if (!caster) {
			this.targetingPreviewGraphics.clear();
			return;
		}

		this.targetingPreviewGraphics.clear();
		const gr = this.targetingPreviewGraphics as unknown as import('../abilities/Ability').IAbilityPreviewGraphics;

		// New-style: ability declares per-timing SelectTargetDef entries — auto-derive preview.
		const selectTargetDefs = getSelectTargetDefsFromTimings(ability);
		if (selectTargetDefs.length > 0) {
			const targetIndex = ts.currentTargets.length;
			const selectDef = selectTargetDefs[targetIndex];
			if (selectDef) {
				const rawCandidates = selectDef.hitbox.renderTargetingPreview(gr, caster, ts.mouseWorld, engine.units);
				// Apply team filter + self-exclusion, then highlight the N closest valid candidates.
				const candidates = filterSelectTargetCandidates(rawCandidates, caster, selectDef.filter);
				if (candidates.length > 0) {
					const mw = ts.mouseWorld;
					candidates.sort((a, b) =>
						(a.x - mw.x) ** 2 + (a.y - mw.y) ** 2 - ((b.x - mw.x) ** 2 + (b.y - mw.y) ** 2),
					);
					const maxHighlights = selectDef.numTargets ?? selectDef.hitbox.numTargets;
					renderMeleeTrackingHighlights(gr, candidates.slice(0, maxHighlights));
				}
			}
			// Also highlight already-committed targets for this ability (using the legacy selected-targets helper if present).
			if (ability.renderTargetingPreviewSelectedTargets) {
				ability.renderTargetingPreviewSelectedTargets(
					gr,
					caster,
					ts.currentTargets,
					ts.mouseWorld,
					engine.units,
					engine,
				);
			}
			return;
		}

		// Legacy: fall through to ability.renderTargetingPreview.
		if (!ability.renderTargetingPreview) return;
		ability.renderTargetingPreview(
			gr,
			caster,
			ts.currentTargets,
			ts.mouseWorld,
			engine.units,
			engine,
		);

		if (ability.renderTargetingPreviewSelectedTargets) {
			ability.renderTargetingPreviewSelectedTargets(
				gr,
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
			if (proj.projectileType === 'throwing_knife') {
				// Point the knife tip in the direction of travel.
				visual.rotation = Math.atan2(proj.velocityY, proj.velocityX) + Math.PI / 2;
			} else {
				visual.rotation = 0;
			}
			if (proj.projectileType === 'energy_blast') {
				const pulseTime = (this.currentEngine?.gameTime ?? 0) * 16;
				const pulse = (Math.sin(pulseTime) + 1) / 2;
				visual.scale.set(0.9 + pulse * 0.3);
				visual.alpha = 0.8 + pulse * 0.2;
			} else {
				visual.scale.set(1);
				visual.alpha = 1;
			}
		}
	}

	// ========================================================================
	// Effects
	// ========================================================================

	private static readonly PARTICLE_EFFECT_TYPES = new Set(['ParticleImage', 'StoryHomingParticle']);

	private renderEffects(effects: Effect[]): void {
		const unitContext = this.getUnitRenderContext();
		const context: IEffectRenderContext = {
			getEffectTexture: (imageKey: EffectImageKey) => this.effectTextures[imageKey] ?? null,
			getCharacterTexture: (characterId: string) => unitContext.getCharacterTexture(characterId),
		};
		for (const effect of effects) {
			if (GameRenderer.PARTICLE_EFFECT_TYPES.has(effect.effectType)) {
				this.syncParticleEffect(effect);
				continue;
			}
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
		if (this.particleEffects.size > 0) this.particleContainer?.update();
	}

	/**
	 * Create or update a Particle in the ParticleContainer for sprite-only particle effects.
	 * Both ParticleImage and StoryHomingParticle use the shared darkBlob texture.
	 */
	private syncParticleEffect(effect: Effect): void {
		const pc = this.particleContainer;
		if (!pc?.texture) return;

		if (!effect.active) {
			const p = this.particleEffects.get(effect.id);
			if (p) {
				pc.removeParticle(p);
				this.particleEffects.delete(effect.id);
			}
			return;
		}

		let particle = this.particleEffects.get(effect.id);
		if (!particle) {
			particle = new Particle({ texture: pc.texture, anchorX: 0.5, anchorY: 0.5 });
			pc.addParticle(particle);
			this.particleEffects.set(effect.id, particle);
		}

		particle.x = effect.x;
		particle.y = effect.y;
		const texW = pc.texture.width || 1;
		const texH = pc.texture.height || 1;

		if (effect.effectType === 'ParticleImage') {
			const data = effect.effectData as { scale?: number; tint?: number };
			particle.tint = data.tint ?? 0xffffff;
			const life = 1 - effect.progress;
			particle.alpha = life * life;
			const base = (data.scale ?? 1) * 18;
			const s = base * (0.6 + 0.4 * life);
			particle.scaleX = s / texW;
			particle.scaleY = s / texH;
		} else {
			// StoryHomingParticle
			const life = Math.max(0.35, 1 - effect.progress * 0.4);
			particle.alpha = life;
			const size = 14 + (1 - effect.progress) * 6;
			particle.scaleX = size / texW;
			particle.scaleY = size / texH;
		}
	}

	// ========================================================================
	// Light Sources
	// ========================================================================

	private renderLightSources(engine: GameEngine): void {
		const lsm = engine.state.lightSourceManager;
		for (const ls of lsm.lightSources) {
			let g = this.lightSourceVisuals.get(ls.id);
			if (!g) {
				g = new Graphics();
				g.zIndex = Z_INDEX.specialTiles - 1;
				this.lightSourceVisuals.set(ls.id, g);
				this.gameContainer.addChild(g);
			}
			g.x = ls.x;
			g.y = ls.y;
			g.visible = ls.active && ls.lightAmount > 0;
			if (!g.visible) continue;
			g.clear();
			const size = Math.max(8, Math.min(20, ls.radius * 4));
			g.circle(0, 0, size);
			g.fill({ color: 0xffaa40, alpha: 0.4 + (ls.lightAmount / 15) * 0.4 });
			g.circle(0, 0, size * 0.6);
			g.fill({ color: 0xffdd00, alpha: 0.5 });
			g.stroke({ color: 0xff6600, width: 1, alpha: 0.8 });
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

		// Clean up knockback shadow visuals for dead/removed units
		for (const [id, shadow] of this.knockbackShadowVisuals) {
			if (!activeUnitIds.has(id)) {
				this.gameContainer.removeChild(shadow);
				shadow.destroy();
				this.knockbackShadowVisuals.delete(id);
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
		for (const [id, particle] of this.particleEffects) {
			if (!activeEffectIds.has(id)) {
				this.particleContainer?.removeParticle(particle);
				this.particleEffects.delete(id);
			}
		}

		const activeLightSourceIds = new Set(engine.state.lightSourceManager.lightSources.map((ls) => ls.id));
		for (const [id, visual] of this.lightSourceVisuals) {
			if (!activeLightSourceIds.has(id)) {
				this.gameContainer.removeChild(visual);
				visual.destroy();
				this.lightSourceVisuals.delete(id);
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
		this.ghostPreviewGraphics.destroy();
		for (const visual of this.unitVisuals.values()) visual.destroy();
		for (const shadow of this.knockbackShadowVisuals.values()) shadow.destroy();
		this.knockbackShadowVisuals.clear();
		for (const visual of this.moveTargetVisuals.values()) visual.destroy();
		for (const visual of this.projectileVisuals.values()) visual.destroy();
		for (const visual of this.effectVisuals.values()) visual.destroy();
		if (this.particleContainer) {
			this.particleContainer.destroy();
			this.particleContainer = null;
		}
		this.particleEffects.clear();
		for (const visual of this.specialTileVisuals.values()) visual.destroy();
		for (const visual of this.constructionGhostVisuals.values()) visual.destroy();
		this.constructionGhostVisuals.clear();
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
		this.initialized = false;
	}
}
