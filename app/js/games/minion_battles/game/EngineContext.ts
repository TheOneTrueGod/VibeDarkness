/**
 * EngineContext - Minimal interface that managers use to reference the engine
 * without a direct dependency on the full GameEngine class.
 *
 * GameEngine implements this interface and passes itself (as EngineContext)
 * to each manager's constructor.
 */

import type { EventBus } from './EventBus';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { Unit } from './units/Unit';
import type { Effect } from './effects/Effect';
import type { Projectile } from './projectiles/Projectile';
import type { SpecialTile } from './specialTiles/SpecialTile';
import type { LightSource as GridLightSource } from './LightGrid';
import type { LightSource } from './lightSources/LightSource';
import type { EffectEmitter } from './effects/EffectEmitter';
import type { TerrainLayerManager } from './TerrainLayerManager';
import type { MapSegmentPOI } from '../terrain/segmentSchema';
import type { SpawnSource, WaitingForOrders } from './types';
import type { CellOccupancyManager } from './managers/CellOccupancyManager';
import type { WorldModifierManager } from '../worldModifiers/WorldModifierManager';

export interface EngineContext {
    gameTime: number;
    gameTick: number;
    roundNumber: number;
    storyPauseActive: boolean;

    readonly eventBus: EventBus;
    terrainManager: TerrainManager | null;

    lightLevelEnabled: boolean;
    globalLightLevel: number;
    aiControllerId: string | null;

    generateRandomNumber(): number;
    generateRandomInteger(min: number, max: number): number;

    getWorldWidth(): number;
    getWorldHeight(): number;

    readonly units: Unit[];
    readonly projectiles: Projectile[];
    readonly effects: Effect[];
    readonly specialTiles: SpecialTile[];
    readonly terrainLayers: TerrainLayerManager;

    addUnit(unit: Unit, spawnSource?: SpawnSource): void;
    addEffect(effect: Effect): void;
    addProjectile(projectile: Projectile): void;
    getUnit(id: string): Unit | undefined;
    getAllies(caster: Unit): Unit[];
    addSpecialTile(tile: SpecialTile): void;
    damageSpecialTile(tileId: string, amount: number): boolean;
    getCrystalProtectedSet(): Set<string>;
    getCrystalProtectionMap(): Map<string, number>;

    getAllLightSources(): GridLightSource[];

    /** All active and inactive persistent LightSources in the scene. */
    readonly lightSources: LightSource[];

    /** Add a persistent LightSource to the scene (e.g. TorchProjectile landing). */
    addLightSource(ls: LightSource): void;

    /** Trigger a story pause: freeze the sim, grant can't-die to player units, resume after durationSeconds. */
    startStoryPause(reason: string, durationSeconds: number): void;

    /** Register an EffectEmitter to be ticked by the EffectEmitterManager. */
    addEffectEmitter(emitter: EffectEmitter): void;

    /** Reveal battle objectives that declare `revealedInitially: false`. */
    revealBattleObjectives(ids: readonly string[]): void;

    /** Returns true when the objective with the given id is completed. */
    isObjectiveCompleted(id: string): boolean;

    /** Record that a unit cast an ability this round (for per-round use tracking). */
    trackAbilityUse(unitId: string, abilityId: string): void;

    /** Mix the ORDER_APPLIED fingerprint event for a given order (called by OrderManager). */
    mixOrderFingerprint(unitId: string, abilityId: string): void;

    /** Unpause when every frozen waiter has a pending order; called by OrderManager after queueing. */
    tryResumeParallel(): void;

    /** Current parallel-order pause batch (null when the simulation is running). */
    readonly waitingForOrders: WaitingForOrders | null;

    /**
     * Cancel an active ability on a unit by ID.
     * Fires ON_CAST_END, runs onInterrupt on all active CastBehaviours, then removes the cast.
     */
    cancelActiveAbility(unitId: string, abilityId: string): void;

    /**
     * Called from unitAbilityTick when a conditionalCancel condition fires on interval exit.
     * Schedules a deferred order pause scoped to the triggering unit so the player can
     * choose an eligible ability or wait (which resumes the current cast).
     * The eligible ability filter is stored on the unit's active ability (conditionalCancelTagFilter).
     */
    requestConditionalCancelPause(unit: Unit): void;

    /**
     * Called from unitAbilityTick when an interval with a SelectTargetDef is entered but no
     * target is yet resolved. Freezes gameTime until the target is provided via the UI.
     */
    signalWaitingForTarget(label: string, unitId: string, abilityId: string): void;

    /**
     * Returns the light level (0–1+) at a world position, or null if light is disabled.
     * Computed lazily and cached per tick.
     */
    getLightLevelAt(x: number, y: number): number | null;

    /**
     * Returns the light level at a grid cell (col, row), or null if light is disabled or out of bounds.
     * Prefer this over getLightLevelAt for renderer tile-index queries (no pixel→grid conversion needed).
     */
    getLightAt(col: number, row: number): number | null;

    /**
     * Allocate a unique id for a game entity (unit, projectile, special tile) owned by this
     * battle instance. The returned ids are serialized and compared between host and non-host.
     *
     * Do NOT use this for visual effects — call `addEffect()` instead, which allocates
     * effect ids from a separate client-side counter that is never fingerprinted or synced.
     */
    allocateObjectId?(prefix?: string): string;

    /** POIs from the loaded map segment(s), used for enemySpawn point lookups. */
    mapPOIs: MapSegmentPOI[];

    /** Runtime cell occupancy tracker for managed units (swarmlings, wolves, etc.). null when unused. */
    cellOccupancyManager: CellOccupancyManager | null;

    /** Mid-battle modifier API: add/remove/enable/disable world modifiers. */
    readonly worldModifierManager: WorldModifierManager;
}
