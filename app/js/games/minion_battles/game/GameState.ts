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
import { EffectManager } from './managers/EffectManager';
import { CardManager } from './managers/CardManager';
import { SpecialTileManager } from './managers/SpecialTileManager';
import { LevelEventManager } from './managers/LevelEventManager';

export class GameState {
    readonly eventBus = new EventBus();

    /** Deterministic RNG seed (host-generated before initial sync). */
    randomSeed = 0;
    gameTime = 0;
    gameTick = 0;
    roundNumber = 1;
    snapshotIndex = 0;
    isPaused = true;
    waitingForOrders: WaitingForOrders | null = null;
    /** Hash of serialized state at current tick; from server on load, recomputed after each sim tick while unpaused. */
    synchash: string | null = null;

    readonly unitManager: UnitManager;
    readonly projectileManager: ProjectileManager;
    readonly effectManager: EffectManager;
    readonly cardManager: CardManager;
    readonly specialTileManager: SpecialTileManager;
    readonly levelEventManager: LevelEventManager;

    terrainManager: TerrainManager | null = null;

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
        this.cardManager = new CardManager(ctx);
        this.specialTileManager = new SpecialTileManager(ctx);
        this.levelEventManager = new LevelEventManager(ctx);
    }
}
