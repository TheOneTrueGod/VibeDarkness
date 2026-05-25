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
import type { BramblePatch } from './brambleSlow';
import type { MapSegmentPOI } from '../terrain/segmentSchema';

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
    readonly effects: Effect[];
    readonly specialTiles: SpecialTile[];
    readonly bramblePatches: readonly BramblePatch[];

    addUnit(unit: Unit): void;
    addEffect(effect: Effect): void;
    addProjectile(projectile: Projectile): void;
    addBramblePatch(patch: BramblePatch): void;
    getUnit(id: string): Unit | undefined;
    getAllies(caster: Unit): Unit[];
    damageSpecialTile(tileId: string, amount: number): boolean;
    getCrystalProtectedSet(): Set<string>;
    getCrystalProtectionMap(): Map<string, number>;

    getAllLightSources(): GridLightSource[];

    /** Add a persistent LightSource to the scene (e.g. TorchProjectile landing). */
    addLightSource(ls: LightSource): void;

    /** Register an EffectEmitter to be ticked by the EffectEmitterManager. */
    addEffectEmitter(emitter: EffectEmitter): void;

    /** Reveal battle objectives that declare `revealedInitially: false`. */
    revealBattleObjectives(ids: readonly string[]): void;

    /** Record that a unit cast an ability this round (for per-round use tracking). */
    trackAbilityUse(unitId: string, abilityId: string): void;

    /** Mix the ORDER_APPLIED fingerprint event for a given order (called by OrderManager). */
    mixOrderFingerprint(unitId: string, abilityId: string): void;

    /** Unpause when every frozen waiter has a pending order; called by OrderManager after queueing. */
    tryResumeParallel(): void;

    /**
     * Returns the light level (0–1+) at a world position, or null if light is disabled.
     * Computed lazily and cached per tick.
     */
    getLightLevelAt(x: number, y: number): number | null;

    /** When implemented (full engine), allocates unique ids for new gameplay objects for this battle instance. */
    allocateObjectId?(prefix?: string): string;

    /** POIs from the loaded map segment(s), used for enemySpawn point lookups. */
    mapPOIs: MapSegmentPOI[];
}
