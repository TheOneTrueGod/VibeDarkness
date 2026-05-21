/**
 * GameState — authoritative battle data: managers, terrain, timing scalars, and queues.
 * GameEngine owns orchestration (tick loop, callbacks); simulation data lives here.
 */
import { EventBus } from './EventBus';
import type { WaitingForOrders, OrderAtTick } from './types';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { EngineContext } from './EngineContext';
import { UnitManager } from './managers/UnitManager';
import { ProjectileManager } from './managers/ProjectileManager';
import { EffectManager } from './effects/EffectManager';
import { CardManager } from './managers/CardManager';
import { SpecialTileManager } from './managers/SpecialTileManager';
import { LevelEventManager } from './managers/LevelEventManager';
import { ObjectiveManager } from './managers/ObjectiveManager';
import { LightSourceManager } from './lightSources/LightSourceManager';
import { EffectEmitterManager } from './effects/EffectEmitterManager';
import { fingerprintInitial, FingerprintRing, type Fingerprint64 } from './Fingerprint';
import type { BramblePatch } from './brambleSlow';

export class GameState {
    readonly eventBus = new EventBus();

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
    waitingForOrders: WaitingForOrders | null = null;
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
    readonly specialTileManager: SpecialTileManager;
    readonly levelEventManager: LevelEventManager;
    readonly objectiveManager: ObjectiveManager;
    readonly lightSourceManager: LightSourceManager;

    terrainManager: TerrainManager | null = null;

    /** Active bramble slow zones (game-state objects, not visual effects). */
    bramblePatches: BramblePatch[] = [];

    /** Orders scheduled to be applied at specific game ticks. */
    pendingOrders: OrderAtTick[] = [];

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
        this.specialTileManager = new SpecialTileManager(ctx);
        this.levelEventManager = new LevelEventManager(ctx);
        this.objectiveManager = new ObjectiveManager(ctx);
        this.lightSourceManager = new LightSourceManager(ctx);
    }
}
