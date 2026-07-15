/**
 * GameState — authoritative battle data: managers, terrain, timing scalars, and queues.
 * GameEngine owns orchestration (tick loop, callbacks); simulation data lives here.
 */
import type { TerrainManager } from '../terrain/TerrainManager';
import type { EngineContext } from './EngineContext';
import { UnitManager } from './managers/UnitManager';
import { ProjectileManager } from './managers/ProjectileManager';
import { EffectManager } from './effects/EffectManager';
import { CardManager } from './managers/CardManager';
import { AbilityUseTracker } from './managers/AbilityUseTracker';
import { ResearchManager } from './managers/ResearchManager';
import { SpecialTileManager } from './managers/SpecialTileManager';
import { LevelEventManager } from './managers/LevelEventManager';
import { ObjectiveManager } from './managers/ObjectiveManager';
import { LightSourceManager } from './lightSources/LightSourceManager';
import { EffectEmitterManager } from './effects/EffectEmitterManager';
import { fingerprintInitial, FingerprintRing, type Fingerprint64 } from './Fingerprint';
import { TerrainLayerManager } from './TerrainLayerManager';
import type { MapSegmentPOI, MapSegmentZone } from '../terrain/segmentSchema';
import { LanterniteRespawnManager } from './lanternite/LanterniteRespawnManager';
import { OrderManager } from './managers/OrderManager';
import type { LightTileGrid } from './lightTileGrid/LightTileGrid';
import { GroupManager } from './units/unitAI/groups/GroupManager';
import { InterruptSystem } from './units/unitAI/plans/InterruptSystem';
import { WorldModifierManager } from '../worldModifiers/WorldModifierManager';
import type { NinjutsuManager } from './ninjutsu/NinjutsuManager';

export class GameState {

    /** Deterministic RNG seed (host-generated before initial sync). */
    randomSeed = 0;
    gameTime = 0;
    gameTick = 0;
    roundNumber = 1;
    snapshotIndex = 0;
    isPaused = true;
    /**
     * Non-host: reserved gate for freezing fixed-step sim relative to heartbeat tail.
     * {@link BattleNet} keeps this cleared during normal optimistic playahead so the client can run
     * until the next natural pause; do not use `gameTick > hostTick` alone to set this.
     */
    multiplayerAwaitHostCatchup = false;
    storyPauseActive = false;
    storyPauseReason: string | null = null;
    storyPauseEndsAt: number | null = null;
    /** Runtime deterministic fingerprint, incrementally mixed during simulation events. */
    runtimeFingerprint: Fingerprint64 = fingerprintInitial();
    /** Ring buffer of recent per-tick fingerprints for sync diagnostics/recovery. */
    runtimeFingerprintRing = new FingerprintRing();

    readonly unitManager: UnitManager;
    readonly projectileManager: ProjectileManager;
    readonly effectManager: EffectManager;
    readonly effectEmitterManager: EffectEmitterManager;
    readonly cardManager: CardManager;
    readonly abilityUseTracker: AbilityUseTracker;
    readonly researchManager: ResearchManager;
    readonly specialTileManager: SpecialTileManager;
    readonly levelEventManager: LevelEventManager;
    readonly objectiveManager: ObjectiveManager;
    readonly lightSourceManager: LightSourceManager;
    readonly lanterniteRespawnManager: LanterniteRespawnManager;
    readonly orderMgr: OrderManager;
    readonly groupManager: GroupManager;
    readonly interruptSystem: InterruptSystem;
    readonly worldModifierManager: WorldModifierManager;

    terrainManager: TerrainManager | null = null;

    /** Global attack-budget manager. Null when ninjutsu is not configured for this session. */
    ninjutsuManager: NinjutsuManager | null = null;

    /** Stored per-tile light levels, updated every LIGHT_TICK_INTERVAL engine ticks. */
    lightTileGrid: LightTileGrid | null = null;

    /** Layered terrain effects: floor (rock modifications), ground (bramble, ice), air (future). */
    terrainLayers = new TerrainLayerManager();

    /** POIs from the loaded map segment(s), used for enemySpawn point lookups. */
    mapPOIs: MapSegmentPOI[] = [];

    /** Zones from the loaded map segment(s), in mission-global grid coords. */
    mapZones: MapSegmentZone[] = [];

    /** The local player's ID. */
    localPlayerId = '';

    /** AI controller ID for enemy units. */
    aiControllerId: string | null = null;

    /** Mission light config. */
    lightLevelEnabled = true;
    globalLightLevel = 0;

    constructor(ctx: EngineContext) {
        this.unitManager = new UnitManager(ctx);
        this.projectileManager = new ProjectileManager(ctx);
        this.effectManager = new EffectManager(ctx);
        this.effectEmitterManager = new EffectEmitterManager();
        this.cardManager = new CardManager(ctx);
        this.abilityUseTracker = new AbilityUseTracker();
        this.researchManager = new ResearchManager();
        this.specialTileManager = new SpecialTileManager(ctx);
        this.levelEventManager = new LevelEventManager(ctx);
        this.objectiveManager = new ObjectiveManager(ctx);
        this.lightSourceManager = new LightSourceManager(ctx);
        this.lanterniteRespawnManager = new LanterniteRespawnManager();
        this.orderMgr = new OrderManager(ctx, () => ctx.tryResumeParallel());
        this.groupManager = new GroupManager();
        this.interruptSystem = new InterruptSystem(() => this.unitManager.units);
        this.worldModifierManager = new WorldModifierManager(ctx);
    }
}
