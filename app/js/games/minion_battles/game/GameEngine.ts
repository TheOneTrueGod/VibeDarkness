/**
 * GameEngine - Core game loop for the battle phase.
 *
 * Thin orchestrator ("manager of managers") that delegates data ownership,
 * CRUD, queries, and per-tick processing to specialized managers while
 * preserving the existing public API via facade methods/getters.
 */

import { EventBus, type CastEndedEarlyEvent, type NearbyStoneDamagedEvent } from './EventBus';
import {
    type OrderWaiter,
    type WaitingForOrders,
    type SerializedGameState,
    type GameEngineFromJSONOpts,
    type OrderAtTick,
    type SpawnSource,
} from './types';
import { Unit } from './units/Unit';
import { Projectile } from './projectiles/Projectile';
import { Effect } from './effects/Effect';
import type { TeamId } from './teams';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { BattleObjectiveDef, LevelEvent, PlayerControlDef } from '../storylines/types';
import type { SpecialTile } from './specialTiles/SpecialTile';
import { isTileDefendPoint } from './specialTiles/SpecialTile';
import type { AIContext, AILightSource } from './units/unitAI';
import type { LightSource as GridLightInput } from './LightGrid';
import type { LightType } from './lighting/lightTypes';
import { LightSource } from './lightSources/LightSource';
import type { Deployable, DeployableQuery } from './deployables/Deployable';
import type { EngineContext } from './EngineContext';
import { GameState } from './GameState';
import type { PassiveBonuses } from '../../../researchTrees/types';
import type { ActiveDarknessStrength } from '../../../darknessStrength/resolve';
import { deserializeEngine, serializeEngine } from './engineSerialization';
import { wireCoreEventListeners } from './engineEventWiring';
import { OrderPauseController } from './orderPause/OrderPauseController';
import { LightingSystem } from './lighting/LightingSystem';
import { NpcControlRegistry } from './npcControl/NpcControlRegistry';
import {
    FingerprintEvent,
    fingerprintInitial,
    fingerprintToHex,
    mix,
    type Fingerprint64,
} from './Fingerprint';
import {
    addRecoveryChargeToUnitAbilities,
    getRoundChargeEligibleAbilityIds,
    syncNestedCardAbilityState,
} from '../abilities/abilityUses';
import { debugSettingsSnapshot, consumeDebugAdvanceTickRequest } from '../../../debug/debugSettingsStore';
import { tickStateHistory } from './tickStateHistory';
import {
    PERF_ENGINE,
    PERF_ENGINE_CLEANUP,
    PERF_ENGINE_EFFECTS,
    PERF_ENGINE_LEVEL_EVENTS,
    PERF_ENGINE_LIGHTING,
    PERF_ENGINE_NESTS,
    PERF_ENGINE_ORDERS,
    PERF_ENGINE_PROJECTILES,
    PERF_ENGINE_RENDER_TICK,
    PERF_ENGINE_UNITS,
    tickPerformanceTracker,
} from './performance/tickPerformanceTracker';
import { tickAllDots, DOT_TICKS_PER_ROUND } from './dotTick';
import { tickDayLightDamage } from './lighting/dayLightDamage';
import { clearUnitTileTransitionState } from './terrainEffects/tileTransitions';
import { CantDieBuff } from '../buffs/CantDieBuff';
import {
    runUnitComponentRoundMilestone,
    runUnitComponentTick,
    type UnitComponentContext,
} from './units/components/unitComponentHooks';
import { spawnUnit as spawnUnitFromDefinition } from './units/spawning/spawnUnit';
import type { SpawnDefinition } from './units/spawning/spawnDefinition';
import { TerrainLayerManager } from './TerrainLayerManager';
import { resetGameObjectIdCounter } from './GameObject';
import type { EffectEmitter } from './effects/EffectEmitter';
import type { WorldModifierManager } from '../worldModifiers/WorldModifierManager';
import type { MapNetworkManager } from './managers/mapNetwork/MapNetworkManager';
import { CellOccupancyManager } from './managers/CellOccupancyManager';
import { CrowdSpacingManager } from './crowdSpacing/CrowdSpacingManager';
import { PathfindingManager } from '../pathfinding/PathfindingManager';
import { getUnitSpawnDef } from './units/unit_defs/unitDef';
import { createAINav } from './units/unitAI/aiNav';
import { NinjutsuManager, countNinjutsuEnemyUnits, type NinjutsuUIState } from './ninjutsu/NinjutsuManager';
import { NINJUTSU_DEFAULT, type NinjutsuPoolConfig } from './ninjutsu/ninjutsuConfig';
import { findImpendingSelectTargetNeed } from './interaction/selectTargetLookahead';
import { BuffRenderEmitterSystem } from './effects/buffParticleAura';
import { advanceUnitLocalClocks, collectUnitFocalRequests } from './time/actorClock';
import {
    isITSPreviewComplete,
    isPreviewCastInstance,
    type SequentialTargetingPreviewCast,
} from './interaction/isITSPreviewComplete';

// Re-exports for backward compatibility

import { FIXED_DT, ROUND_DURATION } from './gameConstants';
import type { StartTimeStopSpec, TimeManager, TimeStop } from './time/TimeManager';
export { FIXED_DT };

/** Save a checkpoint to the server every this many game ticks. */
export const CHECKPOINT_INTERVAL = 10;

/** Engine ticks between each lightGameTick (60/s → 10 ≈ 6 light updates/s). */
export const LIGHT_TICK_INTERVAL = 10;

/** Game world dimensions. */
export const WORLD_WIDTH = 1200;
export const WORLD_HEIGHT = 800;

export type EngineStateCallback = () => void;

/** Per-cell light from `getLightGrid` (lower = darker). Corruption fills only in full darkness — see `DarknessLevel.FULL_DARKNESS`. */

function parseGameObjectIdNumber(id: string): number | null {
    const match = /_(\d+)$/.exec(id);
    return match ? parseInt(match[1], 10) : null;
}

export class GameEngine implements EngineContext {
    /** Initialized before GameState so managers can subscribe during their constructors. */
    readonly eventBus = new EventBus();

    /** Simulation data: managers, terrain, queues, timing scalars. */
    readonly state: GameState = new GameState(this);

    // -- Loop / orchestration (not stored on GameState) --
    private accumulator = 0;
    private lastTimestamp = 0;
    private animFrameId = 0;
    private running = false;

    /** Monotonic id suffix for new GameObjects created while this engine is authoritative. */
    /** @internal read by `engineSerialization.ts`. */
    objectIdSeq = 1;

    // Client-side only — never serialized, never synchronized between host and non-host.
    // Use this (not allocateObjectId) for visual Effect IDs.
    private effectIdSeq = 0;
    /** Render-only buff visuals: particle auras and `Buff.renderEmit` (not serialized). */
    private readonly buffRenderEmitters = new BuffRenderEmitterSystem();

    /**
     * Parallel order pause scheduled during a tick; committed in the **same** `fixedUpdate` after
     * `TICK_END` for that tick (see `commitDeferredOrderPauseAfterCompletedTick`).
     *
     * @internal read by `engineSerialization.ts` and the order-pause tests.
     */
    deferredOrderPause: {
        waiters: OrderWaiter[];
        naturalCompletionUnitIds: readonly string[];
    } | null = null;

    /**
     * Units whose casts ended by duration this tick (cleared each normal tick before `processActiveAbilities`).
     * @internal read by `OrderPauseController`.
     */
    naturalAbilityCompletionUnitIdsThisTick = new Set<string>();

    /** Deferred/parallel order-pause logic (`orderPause/OrderPauseController.ts`); state stays on this engine. */
    private readonly orderPause = new OrderPauseController(this);
    /** Light queries and the light-grid driver (`lighting/LightingSystem.ts`); the grid lives on `GameState`. */
    private readonly lighting = new LightingSystem(this);

    // -- Callbacks (engine wiring, not serialized) --
    /** @internal read by `OrderPauseController`. */
    onWaitingForOrders: ((info: WaitingForOrders) => void) | null = null;
    private onRoundEnd: ((roundNumber: number) => void) | null = null;
    /** @internal read by `OrderPauseController`. */
    onStateChanged: EngineStateCallback | null = null;
    /** @internal read by `OrderPauseController`. */
    onCheckpoint: ((gameTick: number, state: SerializedGameState, orders: OrderAtTick[]) => void) | null = null;
    private onTickComplete: ((gameTick: number, fingerprintHex: string, paused: boolean, adminReason?: string) => void) | null = null;
    /** @internal read by `OrderPauseController`. */
    onParallelBatchResolved: ((batchAtTick: number) => void | Promise<void>) | null = null;
    /**
     * Non-host multiplayer: during interactive targeting, freeze at parallel pauses that include the
     * local player so the sim cannot run past the host's order batch (lobby 39E984). Host/solo keep
     * legacy ITS playahead. Set by BattleSession from `isHost`.
     */
    freezeItsOnLocalPlayerParallelPause = false;

    /**
     * Interactive targeting preview: whether a would-be parallel pause was dropped (ally-only) or
     * frozen (local player is a waiter). Wired by BattleSession for lobby-log observability (lobby 39E984).
     * @internal read by `OrderPauseController`.
     */
    onItsParallelPauseDecision:
        | ((
              decision: 'drop' | 'freeze',
              waiters: readonly OrderWaiter[],
              gameTick: number,
              info?: { missingPick: true },
          ) => void)
        | null = null;
    private pendingAdminReason: string | null = null;
    /** @internal reset by `engineSerialization.ts` on restore. */
    appliedRoundStartRecovery = false;
    /** @internal reset by `engineSerialization.ts` on restore. */
    appliedMidRoundRecovery = false;
    /** @internal reset by `engineSerialization.ts` on restore. */
    appliedDotTicks = 0;

    /**
     * Mission playerControl defs and group->player assignments (`npcControl/NpcControlRegistry.ts`).
     * Assignments are serialized as {@link SerializedGameState.npcControlAssignments}.
     * @internal `engineSerialization.ts` reads and restores `npcControl.assignments`.
     */
    readonly npcControl = new NpcControlRegistry(this.eventBus);

    /** Runtime occupancy tracker — not serialized, rebuilt at the start of each movement phase. */
    readonly cellOccupancyManager = new CellOccupancyManager();

    /** Ephemeral CrowdSpacing grid — not serialized; clear on load, sync+resolve after movement. */
    readonly crowdSpacingManager = new CrowdSpacingManager();

    /** Pathfinding manager — converts walk goals to paths. Not serialized; cleared on load. */
    readonly pathfindingManager = new PathfindingManager();
    /** Walk-goal surface handed to AI nodes (stateless; reads the current terrain manager). */
    private readonly aiNav = createAINav(() => this.terrainManager);

    /**
     * Set by unitAbilityTick when an interval with a SelectTargetDef is entered but no
     * target is yet resolved. Ephemeral — not serialized (not in toJSON/fromJSON).
     */
    waitingForTargetInput: { label: string; unitId: string; abilityId: string } | null = null;
    /** True while an InteractiveTargetingSession preview is running. Suppresses host save/fingerprint. Ephemeral — not serialized. */
    isSequentialTargetingPreview: boolean = false;
    /**
     * Identifies the caster, ability, and starting round number being previewed in an interactive
     * sequential targeting session. Set alongside `isSequentialTargetingPreview`; dies with the
     * preview engine on restore. Ephemeral — not serialized.
     *
     * `endedEarly` is recorded from the `cast_ended_early` event (first event only) so ITS keeps
     * playing forward past an interrupt / fizzle instead of rewinding.
     */
    sequentialTargetingPreviewCast: SequentialTargetingPreviewCast | null = null;

    constructor() {
        // Also re-subscribed in registerCoreEventListeners, which clears the bus on prepare / fromJSON.
        this.eventBus.on('cast_ended_early', this.recordPreviewCastEndedEarly);
    }

    /** Records the first `cast_ended_early` for the ITS preview cast (see `sequentialTargetingPreviewCast`). */
    /** @internal subscribed by `engineEventWiring.ts`. */
    readonly recordPreviewCastEndedEarly = (event: CastEndedEarlyEvent): void => {
        const previewCast = this.sequentialTargetingPreviewCast;
        if (!this.isSequentialTargetingPreview || previewCast == null) return;
        if (previewCast.endedEarly != null) return;
        if (!isPreviewCastInstance(previewCast, event.unitId, event.abilityId, event.castStartTime)) return;
        previewCast.endedEarly = {
            atTick: event.gameTick,
            reason: event.reason,
            ...(event.source ? { source: event.source } : {}),
        };
    };

    get randomSeed(): number { return this.state.randomSeed; }
    set randomSeed(v: number) { this.state.randomSeed = v; }

    get gameTime(): number { return this.state.gameTime; }
    set gameTime(v: number) { this.state.gameTime = v; }

    /** World seconds per tick / FIXED_DT (1 normal, 0 Time Stop). Resolved at the start of each tick. */
    get worldPace(): number {
        return this.state.timeManager.worldPace;
    }

    /** `gameTick * FIXED_DT`: always advances, even during Time Stop. */
    get tickTime(): number {
        return this.state.gameTick * FIXED_DT;
    }

    get timeManager(): TimeManager {
        return this.state.timeManager;
    }

    get gameTick(): number { return this.state.gameTick; }
    set gameTick(v: number) { this.state.gameTick = v; }

    get roundNumber(): number { return this.state.roundNumber; }
    set roundNumber(v: number) { this.state.roundNumber = v; }

    get snapshotIndex(): number { return this.state.snapshotIndex; }
    set snapshotIndex(v: number) { this.state.snapshotIndex = v; }

    get isPaused(): boolean { return this.state.isPaused; }
    set isPaused(v: boolean) { this.state.isPaused = v; }

    get waitingForOrders(): WaitingForOrders | null { return this.state.orderMgr.waitingForOrders; }
    set waitingForOrders(v: WaitingForOrders | null) { this.state.orderMgr.waitingForOrders = v; }

    get storyPauseActive(): boolean { return this.state.storyPauseActive; }
    set storyPauseActive(v: boolean) { this.state.storyPauseActive = v; }

    get storyPauseReason(): string | null { return this.state.storyPauseReason; }
    set storyPauseReason(v: string | null) { this.state.storyPauseReason = v; }

    get storyPauseEndsAt(): number | null { return this.state.storyPauseEndsAt; }
    set storyPauseEndsAt(v: number | null) { this.state.storyPauseEndsAt = v; }

    get runtimeFingerprint(): Fingerprint64 {
        return this.state.runtimeFingerprint;
    }
    set runtimeFingerprint(v: Fingerprint64) {
        this.state.runtimeFingerprint = [v[0] >>> 0, v[1] >>> 0];
    }

    get terrainManager(): TerrainManager | null {
        return this.state.terrainManager;
    }
    set terrainManager(v: TerrainManager | null) {
        this.state.terrainManager = v;
        if (v) {
            v.setCrystalProtectionProvider(() => this.state.specialTileManager.getCrystalProtectionMap());
        }
    }

    get mapPOIs(): import('../terrain/segmentSchema').MapSegmentPOI[] { return this.state.mapPOIs; }
    set mapPOIs(v: import('../terrain/segmentSchema').MapSegmentPOI[]) { this.state.mapPOIs = v; }

    /** Register POIs from the loaded terrain segments for use by spawn behaviours. */
    registerMapPOIs(pois: import('../terrain/segmentSchema').MapSegmentPOI[]): void {
        this.state.mapPOIs = pois;
    }

    get mapZones(): import('../terrain/segmentSchema').MapSegmentZone[] { return this.state.mapZones; }
    set mapZones(v: import('../terrain/segmentSchema').MapSegmentZone[]) { this.state.mapZones = v; }

    /** Register zones from the loaded terrain segments for use by spawn behaviours and future triggers. */
    registerMapZones(zones: import('../terrain/segmentSchema').MapSegmentZone[]): void {
        this.state.mapZones = zones;
    }

    getZoneById(id: string): import('../terrain/segmentSchema').MapSegmentZone | undefined {
        return this.state.mapZones.find((z) => z.id === id);
    }

    get pendingOrders(): OrderAtTick[] { return this.state.orderMgr.pendingOrders; }
    set pendingOrders(v: OrderAtTick[]) { this.state.orderMgr.pendingOrders = v; }

    get localPlayerId(): string { return this.state.localPlayerId; }
    set localPlayerId(v: string) { this.state.localPlayerId = v; }

    get enemyScalingPlayerCount(): number { return this.state.enemyScalingPlayerCount; }
    set enemyScalingPlayerCount(v: number) { this.state.enemyScalingPlayerCount = v; }

    /** Active DarknessStrength packages (statBag at spawn; WM/spawnTweaks in later steps). */
    get activeDarknessStrengths(): ActiveDarknessStrength[] { return this.state.activeDarknessStrengths; }
    set activeDarknessStrengths(value: ActiveDarknessStrength[]) { this.state.activeDarknessStrengths = value; }

    /** Host's Darkness Upgrades passive bonuses (global unit modifiers). */
    get darknessUpgradeBonuses(): PassiveBonuses { return this.state.darknessUpgradeBonuses; }
    set darknessUpgradeBonuses(value: PassiveBonuses) { this.state.darknessUpgradeBonuses = value; }

    /** Host's active Darkness Upgrade node ids (reward source for all players). */
    get darknessUpgradeNodeIds(): string[] { return this.state.darknessUpgradeNodeIds; }
    set darknessUpgradeNodeIds(value: string[]) { this.state.darknessUpgradeNodeIds = value; }

    /** Install resolved DarknessStrengths before mission init / late spawns. */
    setActiveDarknessStrengths(active: ActiveDarknessStrength[]): void {
        this.state.activeDarknessStrengths = active.slice();
    }

    get aiControllerId(): string | null { return this.state.aiControllerId; }
    set aiControllerId(v: string | null) { this.state.aiControllerId = v; }

    get lightLevelEnabled(): boolean { return this.state.lightLevelEnabled; }
    set lightLevelEnabled(v: boolean) { this.state.lightLevelEnabled = v; }

    get globalLightLevel(): number { return this.state.globalLightLevel; }
    set globalLightLevel(v: number) { this.state.globalLightLevel = v; }

    // ========================================================================
    // Facade Getters / Methods
    // ========================================================================

    get units(): Unit[] { return this.state.unitManager.units; }
    get projectiles(): Projectile[] { return this.state.projectileManager.projectiles; }
    get effects(): Effect[] { return this.state.effectManager.effects; }
    get specialTiles(): SpecialTile[] { return this.state.specialTileManager.specialTiles; }
    get terrainLayers(): TerrainLayerManager { return this.state.terrainLayers; }

    get playerResearchTreesByPlayer(): Record<string, Record<string, string[]>> { return this.state.researchManager.playerResearchTreesByPlayer; }
    set playerResearchTreesByPlayer(value: Record<string, Record<string, string[]>>) { this.state.researchManager.playerResearchTreesByPlayer = value; }

    addUnit(unit: Unit, spawnSource: SpawnSource = 'darknessSpawn'): void {
        if (!unit.isPlayerControlled() && spawnSource === 'darknessSpawn') {
            const spawnDef = getUnitSpawnDef(unit.characterId);
            unit.spawnTimer = spawnDef?.duration ?? 0.5;
        }
        if (spawnSource === 'nestSpawn') {
            unit.growAnimTimer = 0.3;
        }
        // Assign NPC control before unitManager.addUnit so moveJitter uses the player branch.
        this.npcControl.tryAssignNpcControlOnSpawn(unit);
        this.state.unitManager.addUnit(unit);
        this.mixRuntimeFingerprint(FingerprintEvent.SPAWN, this.hashString32(unit.id), Math.floor(unit.x), Math.floor(unit.y));
    }

    /**
     * The single code path for constructing a unit from a `SpawnDefinition` and adding it to the
     * battle — resolves placement, builds the unit, applies AI-hookup state, and calls `addUnit`.
     * See game/units/spawning/spawnUnit.ts.
     */
    spawnUnit(def: SpawnDefinition, spawnSource?: SpawnSource): Unit[] {
        return spawnUnitFromDefinition(this, def, spawnSource);
    }

    /** See `NpcControlRegistry.registerPlayerControl`. */
    registerPlayerControl(defs: PlayerControlDef[], assignmentsByGroup: Record<string, string>): void {
        this.npcControl.registerPlayerControl(defs, assignmentsByGroup);
    }

    /** Checkpointed groupId → playerId map (empty when no NPC control is active). */
    getNpcControlAssignments(): Readonly<Record<string, string>> {
        return this.npcControl.getNpcControlAssignments();
    }

    /**
     * Team used for local-client rendering (darkness hiding, previews).
     * First alive unit owned by {@link localPlayerId}, else first owned unit, else `'player'`.
     */
    getLocalPlayerTeamId(): TeamId {
        const owned = this.units.filter((u) => u.ownerId === this.localPlayerId);
        const alive = owned.find((u) => u.isAlive());
        if (alive) return alive.teamId;
        if (owned.length > 0) return owned[0]!.teamId;
        return 'player';
    }

    /** Assign a unit to a player for NPC control. Stamps controlGroupId when provided. */
    assignControl(unit: Unit, playerId: string, groupId?: string | null): void {
        this.npcControl.assignControl(unit, playerId, groupId);
    }

    /** Release a unit back to AI control. */
    releaseControl(unit: Unit): void {
        this.npcControl.releaseControl(unit);
    }

    getUnit(id: string): Unit | undefined { return this.state.unitManager.getUnit(id); }
    getUnits(): Unit[] { return this.state.unitManager.getUnits(); }
    getLocalPlayerUnit(): Unit | undefined { return this.state.unitManager.getLocalPlayerUnit(this.localPlayerId); }
    getAllies(caster: Unit): Unit[] { return this.state.unitManager.getAllies(caster); }

    addProjectile(projectile: Projectile): void {
        projectile.id = this.allocateObjectId('proj');
        this.state.projectileManager.addProjectile(projectile);
        this.mixRuntimeFingerprint(FingerprintEvent.SPAWN, this.hashString32(projectile.id), Math.floor(projectile.x), Math.floor(projectile.y));
    }

    addEffect(effect: Effect): void {
        effect.id = this.allocateEffectObjectId('fx');
        this.state.effectManager.addEffect(effect);
    }

    addLightSource(ls: LightSource): void {
        // Explicit ids (lantern torches, nests, tests) are kept. Auto-ids must come from
        // the engine allocator so preview/rollback cannot leak a process-global counter
        // into fingerprints (see lobby BBA219 / LightSource.determinism.test.ts).
        if (!ls.id) {
            ls.id = this.allocateObjectId('ls');
        }
        this.state.lightSourceManager.addLightSource(ls);
        this.mixRuntimeFingerprint(FingerprintEvent.SPAWN, this.hashString32(ls.id), Math.floor(ls.x), Math.floor(ls.y));
        if (ls.ownerUnitId !== undefined || ls.ownerAbilityId !== undefined || ls.teamId !== undefined) {
            this.mixRuntimeFingerprint(
                FingerprintEvent.SPAWN,
                this.hashString32(ls.ownerUnitId ?? ''),
                this.hashString32(ls.ownerAbilityId ?? ''),
                this.hashString32(ls.teamId ?? ''),
            );
        }
    }

    /** Find deployables on the map owned by `query.castingTeam` (see game/deployables). */
    findDeployables(query: DeployableQuery): Deployable[] {
        return this.state.deployables.findDeployables(query);
    }

    /** Consume a deployable found via {@link findDeployables}. Returns whether it was consumed. */
    consumeDeployable(deployable: Pick<Deployable, 'id' | 'kind'>): boolean {
        return this.state.deployables.consumeDeployable(deployable);
    }

    /**
     * Hash of owner/team on every owned light source and terrain effect, so an ownership desync
     * is detected. Returns 0 when nothing is owned (legacy fingerprints stay unchanged).
     */
    private deployableOwnershipHash(): number {
        let h = 0;
        let any = false;
        const fold = (id: string, owner?: string, ability?: string, team?: string): void => {
            if (owner === undefined && ability === undefined && team === undefined) return;
            any = true;
            // Order-independent (sum of per-entry hashes) so store iteration order cannot matter.
            h = (h + this.hashString32(`${id}|${owner ?? ''}|${ability ?? ''}|${team ?? ''}`)) >>> 0;
        };
        for (const ls of this.state.lightSourceManager.lightSources) {
            fold(ls.id, ls.ownerUnitId, ls.ownerAbilityId, ls.teamId);
        }
        for (const r of this.state.terrainLayers.allEffects.values()) {
            fold(r.id, r.ownerUnitId, r.ownerAbilityId, r.teamId);
        }
        return any ? (h | 1) >>> 0 : 0;
    }

    get effectEmitterManager() { return this.state.effectEmitterManager; }
    get lightSources(): LightSource[] { return this.state.lightSourceManager.lightSources; }

    addEffectEmitter(emitter: EffectEmitter): void {
        this.state.effectEmitterManager.addEmitter(emitter);
    }

    private getUnitPositionSnapshot(): Map<string, { x: number; y: number }> {
        const snap = new Map<string, { x: number; y: number }>();
        for (const unit of this.units) snap.set(unit.id, { x: unit.x, y: unit.y });
        return snap;
    }

    addSpecialTile(tile: SpecialTile): void { this.state.specialTileManager.addSpecialTile(tile); }
    damageSpecialTile(tileId: string, amount: number): boolean { return this.state.specialTileManager.damageSpecialTile(tileId, amount); }
    getCrystalProtectionMap(): Map<string, number> { return this.state.specialTileManager.getCrystalProtectionMap(); }
    getCrystalProtectedSet(): Set<string> { return this.state.specialTileManager.getCrystalProtectedSet(); }
    getCrystalProtectionCount(col: number, row: number): number { return this.state.specialTileManager.getCrystalProtectionCount(col, row); }
    getDarkCrystalFilterSet(): Set<string> { return this.state.specialTileManager.getDarkCrystalFilterSet(); }

    setPlayerResearchTreesByPlayer(map: Record<string, Record<string, string[]>>): void { this.state.researchManager.setPlayerResearchTreesByPlayer(map); }
    getPlayerResearchNodes(playerId: string, treeId: string): string[] { return this.state.researchManager.getPlayerResearchNodes(playerId, treeId); }

    registerLevelEvents(events: LevelEvent[]): void { this.state.levelEventManager.registerLevelEvents(events); }
    setLevelEvents(events: LevelEvent[]): void { this.state.levelEventManager.setLevelEvents(events); }
    registerBattleObjectives(defs: BattleObjectiveDef[]): void {
        this.state.objectiveManager.setDefs(defs);
    }

    getBattleObjectiveRows(): { id: string; label: string; completed: boolean }[] {
        return this.state.objectiveManager.getDisplayRows();
    }

    getObjectiveTileMarkers() {
        return this.state.objectiveManager.getActiveTileMarkers();
    }

    getActiveWorldModifiersForUI():import('../worldModifiers/types').WorldModifierDef[] {
        return this.state.worldModifierManager.getActiveModifiersForUI(this.roundNumber);
    }

    /**
     * Initialise the ninjutsu pool(s) from mission config.
     * Call after initializeGameState; absent config defaults to NINJUTSU_DEFAULT on the 'shadow' pool.
     */
    initNinjutsu(poolConfigs: Partial<Record<string, NinjutsuPoolConfig>> | undefined): void {
        const config: Partial<Record<string, NinjutsuPoolConfig>> = poolConfigs ?? { shadow: NINJUTSU_DEFAULT };
        const enemyUnitCount = countNinjutsuEnemyUnits(this.units);
        this.state.ninjutsuManager = new NinjutsuManager(config, enemyUnitCount);
    }

    getNinjutsuPoolState(): NinjutsuUIState[] | null {
        return this.state.ninjutsuManager?.getUIState(countNinjutsuEnemyUnits(this.units)) ?? null;
    }

    getWorldModifiersDebugSnapshot(): import('../worldModifiers/WorldModifierManager').WorldModifierDebugEntry[] {
        return this.state.worldModifierManager.getModifiersDebugSnapshot(this.roundNumber);
    }

    revealBattleObjectives(ids: readonly string[]): void {
        this.state.objectiveManager.revealObjectiveIds(ids);
    }

    isObjectiveCompleted(id: string): boolean {
        return this.state.objectiveManager.isCompleted(id);
    }

    get worldModifierManager(): WorldModifierManager {
        return this.state.worldModifierManager;
    }

    /** Read-only: mutation goes through `loadFromSegments`/`buildInitialMembership` (mission init
     *  and resync) and `updateUnitNode`/`unregisterUnit` (per-unit steady-state, from
     *  `UnitManager.gameTick` and the `unit_died` listener). */
    get mapNetworkManager(): MapNetworkManager {
        return this.state.mapNetworkManager;
    }

    trackAbilityUse(unitId: string, abilityId: string): void {
        this.state.abilityUseTracker.trackAbilityUse(unitId, abilityId);
    }

    mixOrderFingerprint(unitId: string, abilityId: string): void {
        this.mixRuntimeFingerprint(
            FingerprintEvent.ORDER_APPLIED,
            this.hashString32(unitId),
            this.hashString32(abilityId),
            this.gameTick >>> 0,
        );
    }

    getLightLevelAt(x: number, y: number): number | null {
        return this.lighting.getLightLevelAt(x, y);
    }

    getLightAt(col: number, row: number): number | null {
        return this.lighting.getLightAt(col, row);
    }

    getLightIntensity(col: number, row: number, type: LightType): number | null {
        return this.lighting.getLightIntensity(col, row, type);
    }

    getDominantLightType(col: number, row: number): LightType | null {
        return this.lighting.getDominantLightType(col, row);
    }

    setOnEmitMessage(cb: (text: string, npcId?: string) => void): void {
        this.state.levelEventManager.setOnEmitMessage(cb);
        this.state.objectiveManager.setOnEmitMessage(cb);
    }
    setOnVictory(cb: (missionResult: string) => void): void { this.state.levelEventManager.setOnVictory(cb); }
    setOnDefeat(cb: () => void): void { this.state.levelEventManager.setOnDefeat(cb); }

    // ========================================================================
    // World
    // ========================================================================

    getWorldWidth(): number {
        const grid = this.terrainManager?.grid;
        return grid ? grid.worldWidth : WORLD_WIDTH;
    }

    getWorldHeight(): number {
        const grid = this.terrainManager?.grid;
        return grid ? grid.worldHeight : WORLD_HEIGHT;
    }

    // ========================================================================
    // Light
    // ========================================================================

    getAllLightSources(): GridLightInput[] {
        return this.lighting.getAllLightSources();
    }

    /** Light sources with id for AI (FindLight state). */
    private getLightSourcesForAI(): AILightSource[] {
        return this.lighting.getLightSourcesForAI();
    }

    // ========================================================================
    // Lifecycle
    // ========================================================================

    /** @internal also called by `engineSerialization.ts` after a restore. */
    registerCoreEventListeners(): void {
        wireCoreEventListeners(this);
    }

    startStoryPause(reason: string, durationSeconds: number): void {
        this.storyPauseActive = true;
        this.storyPauseReason = reason;
        this.storyPauseEndsAt = this.gameTime + durationSeconds;
        this.waitingForOrders = null;
        this.deferredOrderPause = null;
        this.isPaused = false;
        for (const unit of this.units) {
            if (!unit.isPlayerControlled() || !unit.isAlive()) continue;
            if (unit.hasBuff('cant_die')) continue;
            unit.addBuff(new CantDieBuff(durationSeconds), this.gameTime, this.roundNumber);
        }
        this.onStateChanged?.();
    }

    private endStoryPause(): void {
        this.storyPauseActive = false;
        this.storyPauseReason = null;
        this.storyPauseEndsAt = null;
        for (const unit of this.units) {
            if (!unit.isPlayerControlled()) continue;
            unit.buffs = unit.buffs.filter((buff) => buff._type !== 'cant_die');
        }
    }

    prepareForNewGame(config: {
        localPlayerId: string;
        randomSeed: number;
        terrainManager?: TerrainManager | null;
        aiControllerId?: string | null;
    }): void {
        this.registerCoreEventListeners();
        this.localPlayerId = config.localPlayerId;
        this.terrainManager = config.terrainManager ?? null;
        this.terrainManager?.setStoneDamagedEmitter((event) => {
            this.eventBus.emit('terrain_stone_damaged', event);
        });
        this.terrainManager?.setTerrainEffectsClearedEmitter((cleared) => {
            this.eventBus.emit('terrain_effects_cleared', { cleared });
        });
        if (this.terrainManager) {
            this.terrainManager.setTerrainLayers(this.state.terrainLayers);
            this.terrainManager.setCrystalProtectionProvider(
                () => this.state.specialTileManager.getCrystalProtectionMap(),
            );
        }
        this.aiControllerId = config.aiControllerId ?? null;
        this.enemyScalingPlayerCount = 1;
        this.state.levelEventManager.resetTerminalState();
        this.resetObjectIdSequence(1);
        this.randomSeed = config.randomSeed >>> 0;
        this.runtimeFingerprint = fingerprintInitial();
        this.state.runtimeFingerprintRing.clear();
        this.appliedRoundStartRecovery = false;
        this.appliedMidRoundRecovery = false;
        this.appliedDotTicks = 0;
        clearUnitTileTransitionState();
        this.crowdSpacingManager.clear();
        this.pathfindingManager.clear();
        this.terrainManager?.pathQuery.clearCache();
    }

    setMissionLightConfig(lightLevelEnabled: boolean, globalLightLevel: number): void {
        this.lightLevelEnabled = lightLevelEnabled;
        this.globalLightLevel = globalLightLevel;
        if (lightLevelEnabled && this.terrainManager?.grid && !this.state.lightTileGrid) this.lighting.initLightGrid();
    }

    applyInstantLightingPass(): void {
        this.lighting.applyInstantLightingPass();
    }

    setOnWaitingForOrders(cb: (info: WaitingForOrders) => void): void {
        this.onWaitingForOrders = cb;
    }

    setOnItsParallelPauseDecision(
        cb:
            | ((
                  decision: 'drop' | 'freeze',
                  waiters: readonly OrderWaiter[],
                  gameTick: number,
                  /** Set when the waiters were missing-pick waiters dropped as an automatic pass-and-fizzle. */
                  info?: { missingPick: true },
              ) => void)
            | null,
    ): void {
        this.onItsParallelPauseDecision = cb;
    }

    setOnRoundEnd(cb: (roundNumber: number) => void): void {
        this.onRoundEnd = cb;
    }

    setOnStateChanged(cb: EngineStateCallback): void {
        this.onStateChanged = cb;
    }

    setOnCheckpoint(cb: (gameTick: number, state: SerializedGameState, orders: OrderAtTick[]) => void): void {
        this.onCheckpoint = cb;
    }

    setOnTickComplete(cb: (gameTick: number, fingerprintHex: string, paused: boolean, adminReason?: string) => void): void {
        this.onTickComplete = cb;
    }

    setOnParallelBatchResolved(cb: ((batchAtTick: number) => void | Promise<void>) | null): void {
        this.onParallelBatchResolved = cb;
    }

    // ========================================================================
    // Admin commands — direct state mutations for debug/host use only.
    // Each mixes ADMIN_STATE_CHANGE into the running fingerprint so non-host
    // clients detect the divergence and resync with the saved snapshot.
    // ========================================================================

    adminHealUnit(unitId: string): void {
        const unit = this.getUnit(unitId);
        if (!unit) return;
        unit.hp = unit.maxHp;
        this.mixRuntimeFingerprint(FingerprintEvent.ADMIN_STATE_CHANGE, 1);
        this.pendingAdminReason = 'admin_heal';
    }

    adminKillUnit(unitId: string): void {
        const unit = this.getUnit(unitId);
        if (!unit || !unit.active) return;
        unit.hp = 0;
        unit.active = false;
        this.eventBus.emit('unit_died', { unitId: unit.id, killerUnitId: null });
        this.mixRuntimeFingerprint(FingerprintEvent.ADMIN_STATE_CHANGE, 2);
        this.pendingAdminReason = 'admin_kill';
    }

    adminMoveUnit(unitId: string, x: number, y: number): void {
        const unit = this.getUnit(unitId);
        if (!unit) return;
        unit.x = x;
        unit.y = y;
        unit.clearMovement();
        this.mixRuntimeFingerprint(FingerprintEvent.ADMIN_STATE_CHANGE, 3);
        this.pendingAdminReason = 'admin_move';
    }

    /** True while {@link GameEngine.start} has started the rAF/tick loop and {@link GameEngine.stop} has not torn it down. */
    get isSimulationLoopRunning(): boolean {
        return this.running;
    }

    // ========================================================================
    // RNG
    // ========================================================================

    /** Returns a raw 31-bit integer in [0, 0x7fffffff]. NOT a [0, 1] float.
     *  Divide by 0x7fffffff to normalise: `const rand = () => engine.generateRandomNumber() / 0x7fffffff;`
     *  Use generateRandomInteger(min, max) when you need a bounded integer — it normalises internally. */
    generateRandomNumber(): number {
        this.randomSeed = ((this.randomSeed * 1103515245 + 12345) >>> 0);
        this.mixRuntimeFingerprint(FingerprintEvent.RNG, this.randomSeed);
        return this.randomSeed & 0x7fffffff;
    }

    generateRandomInteger(min: number, max: number): number {
        if (max < min) return min;
        const n = this.generateRandomNumber();
        const range = max - min + 1;
        return min + (n % range);
    }

    // ========================================================================
    // Game Loop
    // ========================================================================

    start(): void {
        if (this.running) return;
        this.running = true;
        this.accumulator = 0;
        this.lastTimestamp = performance.now();
        this.animFrameId = requestAnimationFrame((ts) => this.loop(ts));
    }

    /** Clear deferred pause and wall-clock catch-up so a loaded battle does not burst-simulate on first paint. */
    clearDeferredOrderPauseAndAccumulator(): void {
        this.deferredOrderPause = null;
        this.accumulator = 0;
    }

    stop(): void {
        this.running = false;
        if (this.animFrameId) {
            cancelAnimationFrame(this.animFrameId);
            this.animFrameId = 0;
        }
    }

    /**
     * Advance the simulation by N fixed physics steps (60 Hz), independent of `requestAnimationFrame` / pause.
     * Intended for headless tests and tooling.
     */
    stepSimulationFixedTicks(n: number): void {
        const steps = Math.max(0, Math.floor(n));
        for (let i = 0; i < steps; i++) {
            this.fixedUpdate(FIXED_DT);
        }
    }

    /**
     * True while game ticks are not running: explicit pause, a parallel order batch (pause plane), waiting for
     * target input, host catch-up, or a finished level. Effects and emitters use it for their `pauseBehaviour`.
     * Story pauses are not halts (game ticks keep running through them).
     */
    get isSimulationHalted(): boolean {
        return this.isPaused
            || this.waitingForOrders != null
            || this.waitingForTargetInput != null
            || this.state.multiplayerAwaitHostCatchup
            || this.state.levelEventManager.isTerminal;
    }

    /** True while `start()` has been called and `stop()` / `destroy()` has not. */
    get isRunningLoop(): boolean {
        return this.running;
    }

    /**
     * Advance purely visual effects (Effect elapsed time, emitter particle bursts) by `realDt` seconds.
     *
     * The engine's own `loop()` calls this automatically every rAF frame. External renderers that drive
     * the engine manually (e.g. scenario-preview modal) should call this once per render frame so effects
     * animate and expire correctly — but only when the engine is **not** already running its own loop
     * (i.e. when `isRunningLoop` is false).
     */
    doRenderTick(realDt: number): void {
        tickPerformanceTracker.measure([PERF_ENGINE, PERF_ENGINE_RENDER_TICK], () => {
            const halted = this.isSimulationHalted;
            this.state.effectManager.renderUpdate(realDt, halted);
            const posSnapshot = this.getUnitPositionSnapshot();
            const emitterVisualEffects = this.state.effectEmitterManager.renderUpdate(
                realDt, posSnapshot, halted, this,
            );
            for (const fx of emitterVisualEffects) {
                fx.id = this.allocateEffectObjectId('fx');
                this.state.effectManager.addEffect(fx);
            }
            this.buffRenderEmitters.update(this.units, realDt, (fx) => {
                fx.id = this.allocateEffectObjectId('fx');
                this.state.effectManager.addEffect(fx);
            }, { gameTime: this.gameTime, halted });
        });
    }

    /** Advance simulation by a wall-clock duration using fixed-step integration at 60 Hz. */
    advanceSimulationSeconds(sec: number): void {
        if (sec <= 0) return;
        const steps = Math.round(sec / FIXED_DT);
        this.stepSimulationFixedTicks(steps);
    }

    /**
     * Effect types that may stay `active` for a long time but are not transient combat/VFX
     * (scenario runners should not wait on them to "finish playing").
     */
    private static readonly SCENARIO_RUNNER_NON_BLOCKING_EFFECT_TYPES = new Set<string>(['Torch']);

    /**
     * True when scripted battle work is done: no pending orders, no casts/movement/knockback/wait
     * lockout on units, no active projectiles, and no active transient effects.
     * Used by `testing/runner/SimulationRunner` to end scenarios early instead of burning max ticks.
     */
    isScenarioRunnerBattleIdle(): boolean {
        if (this.pendingOrders.length > 0) return false;
        for (const unit of this.units) {
            if (!unit.active) continue;
            if (unit.activeAbilities.length > 0) return false;
            if (unit.isInKnockback()) return false;
            if (unit.movement != null && unit.movement.path.length > 0) return false;
            if (unit.isInWaitLockout()) return false;
        }
        for (const p of this.projectiles) {
            if (p.active) return false;
        }
        for (const e of this.effects) {
            if (!e.active) continue;
            if (GameEngine.SCENARIO_RUNNER_NON_BLOCKING_EFFECT_TYPES.has(e.effectType)) continue;
            return false;
        }
        return true;
    }

    /** Allocate a unique id for a new unit or projectile under this engine instance. */
    allocateObjectId(prefix = 'obj'): string {
        return `${prefix}_${this.objectIdSeq++}`;
    }

    /** Allocate a unique id for a visual Effect. Client-side only — never fingerprinted or synced. */
    private allocateEffectObjectId(prefix = 'fx'): string {
        return `${prefix}_${this.effectIdSeq++}`;
    }

    /** Reset id allocation (e.g. fresh battle). */
    resetObjectIdSequence(next = 1): void {
        this.objectIdSeq = Math.max(1, Math.floor(next));
    }

    /**
     * After deserializing a snapshot, bump the allocator so newly spawned objects never reuse
     * numeric suffixes from restored ids.
     */
    syncObjectIdsFromSnapshot(data: SerializedGameState): void {
        if (data.nextObjectId != null) {
            this.resetObjectIdSequence(data.nextObjectId);
            resetGameObjectIdCounter(data.nextObjectId);
            return;
        }
        // Legacy snapshots without nextObjectId: derive from max serialized ID.
        let maxN = 0;
        for (const u of data.units ?? []) {
            const id = (u as { id?: string }).id;
            if (typeof id === 'string') {
                const n = parseGameObjectIdNumber(id);
                if (n !== null && n > maxN) maxN = n;
            }
        }
        for (const p of data.projectiles ?? []) {
            const id = (p as { id?: string }).id;
            if (typeof id === 'string') {
                const n = parseGameObjectIdNumber(id);
                if (n !== null && n > maxN) maxN = n;
            }
        }
        for (const ls of data.lightSources ?? []) {
            const id = (ls as { id?: string }).id;
            if (typeof id === 'string') {
                const n = parseGameObjectIdNumber(id);
                if (n !== null && n > maxN) maxN = n;
            }
        }
        if (maxN > 0) {
            this.resetObjectIdSequence(maxN + 1);
            resetGameObjectIdCounter(maxN + 1);
        }
    }

    private loop(timestamp: number): void {
        if (!this.running) return;

        const frameTime = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
        this.lastTimestamp = timestamp;

        // Advance purely visual effects every render frame regardless of game pause.
        this.doRenderTick(frameTime);

        const debugPauseModeActive = debugSettingsSnapshot.debugPauseMode;
        const canRunSimulation =
            !this.state.levelEventManager.isTerminal &&
            !this.isPaused &&
            !this.state.multiplayerAwaitHostCatchup;
        if (canRunSimulation) {
            if (debugPauseModeActive) {
                // Explicit one-step mode for deterministic debug inspection.
                if (consumeDebugAdvanceTickRequest()) {
                    this.accumulator += FIXED_DT;
                } else {
                    this.accumulator = 0;
                }
            } else {
                this.accumulator += frameTime;
            }
        }

        let stateChanged = false;
        while (this.accumulator >= FIXED_DT) {
            const hadWaitingOrders = this.waitingForOrders != null;
            const wasPaused = this.isPaused;
            this.fixedUpdate(FIXED_DT);
            this.accumulator -= FIXED_DT;
            stateChanged = true;
            // Stop draining this frame once we enter a parallel-order pause; remainder stays for later frames.
            if (this.waitingForOrders != null && !hadWaitingOrders) break;
            // Stop draining when fixedUpdate paused the engine (e.g. sequential target-input pause).
            if (this.isPaused && !wasPaused) break;
        }

        if (stateChanged) {
            this.onStateChanged?.();
        }

        this.animFrameId = requestAnimationFrame((ts) => this.loop(ts));
    }

    /** @internal used by `engineEventWiring.ts`. */
    hashString32(input: string): number {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < input.length; i++) {
            h ^= input.charCodeAt(i) & 0xff;
            h = Math.imul(h, 16777619) >>> 0;
        }
        return h >>> 0;
    }

    /** @internal used by `engineEventWiring.ts`. */
    mixRuntimeFingerprint(tag: number, ...payload: number[]): void {
        this.runtimeFingerprint = mix(this.runtimeFingerprint, tag, ...payload.map((v) => v >>> 0));
    }

    getRuntimeFingerprintHex(): string {
        return fingerprintToHex(this.runtimeFingerprint);
    }

    computeInitialFingerprint(): string {
        let fp = fingerprintInitial();
        fp = mix(
            fp,
            FingerprintEvent.TICK_END,
            this.randomSeed >>> 0,
            this.roundNumber >>> 0,
            this.gameTick >>> 0,
            this.snapshotIndex >>> 0,
        );
        const sortedUnits = [...this.units].sort((a, b) => a.id.localeCompare(b.id));
        for (const unit of sortedUnits) {
            fp = mix(
                fp,
                FingerprintEvent.SPAWN,
                this.hashString32(unit.id),
                Math.floor(unit.x),
                Math.floor(unit.y),
                Math.floor(unit.hp),
            );
        }
        return fingerprintToHex(fp);
    }

    /**
     * Same boolean written with each tick-complete fingerprint row (`runtimeFingerprintRing` / `onTickComplete`).
     */
    getFingerprintTailPaused(): boolean {
        return (
            this.isPaused ||
            this.waitingForOrders != null ||
            this.deferredOrderPause != null ||
            this.storyPauseActive
        );
    }

    private commitDeferredOrderPauseAfterCompletedTick(): boolean {
        return this.orderPause.commitDeferredOrderPauseAfterCompletedTick();
    }

    /**
     * Start a Time Stop: the single engine entry point. World pace is 0 from the next tick for `durationTickSeconds`
     * of TICK time (clamped to `MAX_TIME_STOP_TICK_SECONDS`); exempt actors keep stepping at `exemptRate`.
     * `frozenHitPolicy` is the stop's own policy for hits on frozen actors (wins over a per-hit option).
     * Emits `time_stop_started`; `time_stop_ended` and `world_pace_changed` follow when pace resolves.
     * See `game/time/AGENTS.md`.
     */
    startTimeStop(spec: StartTimeStopSpec): TimeStop {
        const stop = this.state.timeManager.startTimeStop(spec, this.gameTick);
        this.eventBus.emit('time_stop_started', {
            id: stop.id,
            sourceActorId: stop.sourceActorId,
            durationTicks: stop.durationTicks,
            exemptActorIds: [...stop.exemptActorIds],
            exemptRate: stop.exemptRate,
            gameTick: this.gameTick,
        });
        return stop;
    }

    /** End a Time Stop early (it also ends by itself on its tick-time duration). Returns false for an unknown id. */
    endTimeStop(id: string): boolean {
        const stop = this.state.timeManager.endTimeStop(id);
        if (!stop) return false;
        this.eventBus.emit('time_stop_ended', {
            id: stop.id,
            sourceActorId: stop.sourceActorId,
            reason: 'ended',
            gameTick: this.gameTick,
        });
        return true;
    }

    /**
     * Focal world-pace requests from actors (each in `[WORLD_PACE_MIN, 1]`): one per living unit buff whose
     * `timeModifier.focal` is set. Projectile buffs join in Step 6.
     */
    private collectFocalRequests(): number[] {
        return collectUnitFocalRequests(this.state.unitManager.getUnits());
    }

    /**
     * Host in-place ITS commit: the preview stopped at a tick whose parallel pause playahead dropped.
     * A canonical run of the same order commits that pause at the end of this tick (atTick = gameTick + 1),
     * so form it now — otherwise the next `fixedUpdate` collects the waiters one tick late.
     * Call after preview flags are cleared (promotion). No-op when the drop was on an earlier tick.
     *
     * @returns true when a parallel order pause was committed.
     */
    commitDroppedItsPreviewPauseForStopTick(): boolean {
        return this.orderPause.commitDroppedItsPreviewPauseForStopTick();
    }

    /**
     * One fixed simulation step. Reads as the ordered list of tick phases; the order is load-bearing
     * (determinism across host and clients), so never reorder without a determinism test.
     */
    private fixedUpdate(dt: number): void {
        if (this.state.levelEventManager.isTerminal) {
            return;
        }

        // Fingerprint invariant: row for tick N is emitted after TICK_END for tick N; `paused` matches
        // {@link getFingerprintTailPaused} after any in-frame deferred pause commit.
        // Plans/end_of_tick_persistence_and_fingerprint_paused.md

        // Parallel order batch (`waitingForOrders`): do not advance gameTick or simulate further until resumed.
        // Do not key off `isPaused` alone — GameState defaults `isPaused` true before the battle shell clears it,
        // while headless `stepSimulationFixedTicks` must still run ticks in that window.
        // `loop()` may drain multiple FIXED_DT steps per rAF; without this guard, a second `fixedUpdate` in the
        // same frame could run the normal path after the deferred pause branch above committed this pause.
        if (this.waitingForOrders != null) {
            return;
        }

        // Interactive select-target lookahead: pause before advancing time for a gated select's entry tick.
        // The tick that reaches a select's start is cut short there (findSelectGateSplit), so effects
        // scheduled at or before the start run first. The pause is then taken before the select enters.
        if (this.waitingForTargetInput != null) return;

        const worldDt = this.tickResolveWorldPace(dt);
        if (this.tickPauseForImpendingSelectTarget(dt)) return;

        this.tickAdvanceClocks(dt, worldDt);
        this.tickRunSimulation(dt, worldDt);
        this.tickFinish();
    }

    /**
     * Phase: resolve world pace for this tick (Time Stops, then focal requests), then derive world dt.
     * Pace-1 invariance: when pace is exactly 1, worldDt === dt (no multiply, no float drift).
     */
    private tickResolveWorldPace(dt: number): number {
        const previousPace = this.state.timeManager.worldPace;
        const endedStops = this.state.timeManager.resolveWorldPace(this.collectFocalRequests(), this.gameTick + 1);
        const worldPace = this.state.timeManager.worldPace;
        for (const stop of endedStops) {
            this.eventBus.emit('time_stop_ended', {
                id: stop.id,
                sourceActorId: stop.sourceActorId,
                reason: 'expired',
                gameTick: this.gameTick + 1,
            });
        }
        if (worldPace !== previousPace) {
            this.eventBus.emit('world_pace_changed', { previousPace, worldPace, gameTick: this.gameTick + 1 });
        }
        return worldPace === 1 ? dt : dt * worldPace;
    }

    /** Phase: select-target lookahead. Returns true when the tick must stop before advancing time. */
    private tickPauseForImpendingSelectTarget(dt: number): boolean {
        const impendingSelectTarget = findImpendingSelectTargetNeed(this, dt);
        if (impendingSelectTarget != null) {
            const { label, unitId, abilityId } = impendingSelectTarget;
            this.signalWaitingForTarget(label, unitId, abilityId);
            return true;
        }
        return false;
    }

    /**
     * Phase: advance world time, per-actor local clocks and the tick counter.
     *
     * Clock audit for `dt` in the tick phases (see game/time/AGENTS.md):
     *  - WORLD (`worldDt`): gameTime/round progress, DoTs/regen/passives/buffs/units/projectiles (interim:
     *    Steps 5-6 move unit/projectile steps to per-actor local time), darkness corruption, light source
     *    decay, nests, select-target lookahead.
     *  - TICK (`gameTick`): AI cadence (`everyAITicks`, group manager), LIGHT_TICK_INTERVAL, orders.
     *  - WALL (`dt`): visual effects and emitters (unaffected by pace unless a `timeDomain` opt-in).
     */
    private tickAdvanceClocks(dt: number, worldDt: number): void {
        const prevGameTime = this.gameTime;
        this.gameTime += worldDt;
        // Local clocks advance right after gameTime and before orders apply (a cast started this tick stamps its
        // local startTime after the advance, exactly like startTime = gameTime at pace 1). Step 5 may restructure.
        advanceUnitLocalClocks(this.state.unitManager.getUnits(), this, dt, prevGameTime);
        this.gameTick++;
        this.naturalAbilityCompletionUnitIdsThisTick.clear();
        this.orderPause.clearDroppedItsPreviewPause();
    }

    /** Phases that simulate the tick, in order, under the performance tracker. */
    private tickRunSimulation(dt: number, worldDt: number): void {
        tickPerformanceTracker.begin(PERF_ENGINE);
        try {
            const roundTime = this.gameTime - (this.roundNumber - 1) * ROUND_DURATION;
            this.processRoundProgressMilestones(roundTime);
            this.tickApplyScheduledOrders();
            this.tickDecayLights();
            this.tickCheckRoundEnd(roundTime);
            this.tickLevelEventsAndUnits(worldDt);
            this.state.unitManager.tickDarknessCorruption(worldDt, this);
            this.tickProjectiles();
            this.tickEffects(dt);
            this.tickLighting(worldDt);
            this.tickUnitComponents(worldDt);
            this.tickCleanup();
            this.tickMixEffectFingerprint();
            this.tickStoryPauseAndEndChecks();
        } finally {
            tickPerformanceTracker.end();
            // Finalize before checkpoint / tick-log toJSON so performanceLog is attached.
            tickPerformanceTracker.finalizeLastGameTick(this.gameTick);
        }
    }

    /** Phase: apply scheduled orders (stable merge when multiple orders share this tick). */
    private tickApplyScheduledOrders(): void {
        tickPerformanceTracker.measure([PERF_ENGINE_ORDERS], () => {
            const toApply = this.pendingOrders.filter((o) => o.gameTick === this.gameTick);
            this.pendingOrders = this.pendingOrders.filter((o) => o.gameTick !== this.gameTick);
            toApply.sort((a, b) => {
                const ua = a.order.unitId;
                const ub = b.order.unitId;
                return ua < ub ? -1 : ua > ub ? 1 : 0;
            });
            for (const { order } of toApply) {
                this.state.orderMgr.applyOrderLogic(order);
            }
        });
    }

    /** Phase: world-time decay of special-tile and standalone light sources. */
    private tickDecayLights(): void {
        this.state.specialTileManager.processSpecialTileLightDecays();
        this.state.lightSourceManager.processDecays();
    }

    /** Phase: round end (event, callback, round counter, milestone flags). */
    private tickCheckRoundEnd(roundTime: number): void {
        if (roundTime >= ROUND_DURATION) {
            this.eventBus.emit('round_end', { roundNumber: this.roundNumber });
            this.onRoundEnd?.(this.roundNumber);
            this.roundNumber++;
            this.appliedRoundStartRecovery = false;
            this.appliedMidRoundRecovery = false;
            this.appliedDotTicks = 0;
        }
    }

    /** Phase: level events, objectives, AI groups, units, parallel-pause scheduling, crystal aura, special tiles. */
    private tickLevelEventsAndUnits(worldDt: number): void {
        if (!this.storyPauseActive) {
            tickPerformanceTracker.measure([PERF_ENGINE_LEVEL_EVENTS], () => {
                this.state.levelEventManager.processLevelEvents();
                this.state.objectiveManager.processObjectives();
            });
            const aiCtx = this.buildAIContext();
            this.state.groupManager.tick(this.gameTick, aiCtx);
            tickPerformanceTracker.measure([PERF_ENGINE_UNITS], () => {
                this.state.unitManager.gameTick(
                    worldDt,
                    this,
                    (unitId: string) => this.naturalAbilityCompletionUnitIdsThisTick.add(unitId),
                    aiCtx,
                );
            });
            // Preview stop: pause when isITSPreviewComplete (natural completion or conditional cancel).
            if (isITSPreviewComplete(this) && !this.isPaused) {
                this.isPaused = true;
            }
            this.orderPause.scheduleParallelPauseAfterUnitTick();
            this.state.unitManager.processCrystalAura();
            this.state.specialTileManager.gameTick(this.units, this);
        }
    }

    /** Phase: projectile movement and hits (skipped during a story pause). */
    private tickProjectiles(): void {
        if (!this.storyPauseActive) {
            tickPerformanceTracker.measure([PERF_ENGINE_PROJECTILES], () => {
                this.state.projectileManager.update(this.state.timeManager);
            });
        }
    }

    /** Phase: visual effects and emitters (wall-clock `dt`). */
    private tickEffects(dt: number): void {
        tickPerformanceTracker.measure([PERF_ENGINE_EFFECTS], () => {
            const emitterEffects = this.state.effectEmitterManager.update(dt, this);
            for (const fx of emitterEffects) {
                fx.id = this.allocateEffectObjectId('fx');
                this.state.effectManager.addEffect(fx);
            }
            this.state.effectManager.gameUpdate(dt);
        });
    }

    /** Phase: light source update and the periodic light-grid animation. */
    private tickLighting(worldDt: number): void {
        tickPerformanceTracker.measure([PERF_ENGINE_LIGHTING], () => {
            this.state.lightSourceManager.update(worldDt);
            if (this.gameTick % LIGHT_TICK_INTERVAL === 0) this.lighting.runLightGameTick();
        });
    }

    /** Phase: unit-component tick hooks (nests, spawners, ...). */
    private tickUnitComponents(worldDt: number): void {
        tickPerformanceTracker.measure([PERF_ENGINE_NESTS], () => {
            runUnitComponentTick(this.buildUnitComponentContext(worldDt));
        });
    }

    /** Phase: remove inactive units, projectiles, effects, light sources and expired terrain effects. */
    private tickCleanup(): void {
        tickPerformanceTracker.measure([PERF_ENGINE_CLEANUP], () => {
            this.state.unitManager.cleanupInactive();
            this.state.projectileManager.cleanupInactive();
            this.state.effectManager.cleanupInactive();
            this.state.lightSourceManager.cleanupInactive();
            this.state.terrainLayers.cleanupExpired(this.gameTime);
        });
    }

    /** Phase: mix entity counts and deployable ownership into the runtime fingerprint. */
    private tickMixEffectFingerprint(): void {
        this.mixRuntimeFingerprint(
            FingerprintEvent.EFFECT_TICK,
            this.projectiles.length >>> 0,
            this.units.length >>> 0,
            this.state.lightSourceManager.lightSources.length >>> 0,
        );
        const deployableHash = this.deployableOwnershipHash();
        if (deployableHash !== 0) {
            this.mixRuntimeFingerprint(FingerprintEvent.EFFECT_TICK, deployableHash);
        }
    }

    /** Phase: defeat/victory checks, or ending an elapsed story pause. */
    private tickStoryPauseAndEndChecks(): void {
        if (!this.storyPauseActive) {
            this.state.levelEventManager.runDefeatCheck();
            // Mirror defeat: catch projectile/DoT kills after unitManager's per-enemy checks.
            this.state.levelEventManager.runVictoryChecks();
        } else if (this.storyPauseEndsAt != null && this.gameTime >= this.storyPauseEndsAt) {
            this.endStoryPause();
        }
    }

    /**
     * Phase: end of tick. Fingerprint tail (TIME_STATE, TICK_END), commit any deferred parallel order pause,
     * push the fingerprint ring row, notify `onTickComplete` and retain the tick record.
     */
    private tickFinish(): void {
        if (!this.state.timeManager.isDefault()) {
            // Only while non-default so pace-1 fingerprints stay byte-identical.
            this.mixRuntimeFingerprint(
                FingerprintEvent.TIME_STATE,
                Math.round(this.state.timeManager.worldPace * 1e6),
                this.state.timeManager.timeStops.length,
            );
        }
        this.mixRuntimeFingerprint(FingerprintEvent.TICK_END, this.gameTick >>> 0, Math.floor(this.gameTime * 1000));
        this.commitDeferredOrderPauseAfterCompletedTick();
        const paused =
            this.isPaused ||
            this.waitingForOrders != null ||
            this.deferredOrderPause != null ||
            this.storyPauseActive;
        this.state.runtimeFingerprintRing.push(this.gameTick, this.runtimeFingerprint, paused);
        this.onTickComplete?.(this.gameTick, this.getRuntimeFingerprintHex(), paused, this.pendingAdminReason ?? undefined);
        this.pendingAdminReason = null;
        // Always retain the same payload the console toggle would print; dump via «Log local state».
        const tickRecord = {
            syncHash: this.getRuntimeFingerprintHex(),
            gameTick: this.gameTick,
            gameState: this.toJSON(),
        };
        tickStateHistory.push(tickRecord);
        if (debugSettingsSnapshot.logEveryTick) {
            console.log('[tick]', tickRecord);
        }
    }

    // ========================================================================
    // Turn / Pause System
    // ========================================================================

    /**
     * Unpause only when every frozen waiter has a pending order at the batch tick.
     * Invoked after each `applyOrder` / remote `queueOrder` while paused.
     *
     * Host: when {@link setOnParallelBatchResolved} returns a Promise (or promise-like result),
     * clears the pause only after it settles successfully — merge-applied HTTP uses this path.
     * When the hook returns a non‑thenable (for example undefined with no networked adapter),
     * the pause clears synchronously so headless/engine-only loops remain deterministic.
     * Non-host / no hook: clears synchronously.
     */
    tryResumeParallel(): void {
        this.orderPause.tryResumeParallel();
    }

    /** @deprecated Use {@link tryResumeParallel}; kept for tests and gradual migration. */
    resumeAfterOrders(): void {
        this.tryResumeParallel();
    }

    // ========================================================================
    // Active Ability Processing
    // ========================================================================

    /**
     * Emit a typed nearby-stone-damaged event for Earth Core reactions.
     * Producers can call this helper instead of emitting directly.
     */
    emitNearbyStoneDamaged(event: NearbyStoneDamagedEvent): void {
        this.eventBus.emit('nearby_stone_damaged', event);
    }

    cancelActiveAbility(unitId: string, abilityId: string): void {
        const unit = this.getUnit(unitId);
        if (!unit) return;
        unit.cancelActiveAbility(abilityId, this);
    }

    requestConditionalCancelPause(unit: Unit): void {
        this.orderPause.requestMidCastOrderPause(unit);
    }

    /**
     * Missing-pick pause: the cast (`awaitingPickLabel` set by the caller) reached a select whose pick its
     * order lacks. Same deferred-pause mechanics as a conditional cancel; the order resolver is
     * `OrderManager`'s missing-pick decision (an `updateTargets` order, or `wait` to fizzle).
     */
    requestMissingPickPause(unit: Unit): void {
        this.orderPause.requestMidCastOrderPause(unit);
    }

    interruptUnitAndRefundAbilities(unit: Unit): void {
        unit.interruptAndRefundAbilities(this);
    }

    /**
     * Pause the simulation until the player provides a SelectTargetDef target.
     * Called from the pre-tick lookahead in fixedUpdate.
     */
    signalWaitingForTarget(label: string, unitId: string, abilityId: string): void {
        this.waitingForTargetInput = { label, unitId, abilityId };
        this.isPaused = true;
    }

    // ========================================================================
    // AI
    // ========================================================================

    private buildAIContext(): AIContext {
        return {
            gameTick: this.gameTick,
            gameTime: this.gameTime,
            getUnit: (id) => this.getUnit(id),
            getUnits: () => this.units,
            getSpecialTiles: () => this.specialTiles,
            getAliveDefendPoints: () => this.specialTiles.filter(isTileDefendPoint),
            getLightSources: () => this.getLightSourcesForAI(),
            terrainManager: this.terrainManager,
            nav: this.aiNav,
            queueOrder: (atTick, order) => this.state.orderMgr.queueOrder(atTick, order),
            emitTurnEnd: (unitId) => this.eventBus.emit('turn_end', { unitId, unitIds: [unitId] }),
            generateRandomInteger: (min, max) => this.generateRandomInteger(min, max),
            getAbilityUsesThisRound: (unitId, abilityId) =>
                this.state.abilityUseTracker.getAbilityUsesThisRound(unitId, abilityId),
            WORLD_WIDTH: this.getWorldWidth(),
            WORLD_HEIGHT: this.getWorldHeight(),
            hasLineOfSight: (fromX, fromY, toX, toY) =>
                this.terrainManager?.grid.hasLineOfSight(fromX, fromY, toX, toY) ?? false,
            cancelActiveAbility: (unitId, abilityId) => this.cancelActiveAbility(unitId, abilityId),
            mapPOIs: this.mapPOIs,
            ninjutsuManager: this.state.ninjutsuManager ?? undefined,
            mapNetwork: this.state.mapNetworkManager,
        };
    }

    // ========================================================================
    // Round End
    // ========================================================================

    /** @internal invoked by `engineEventWiring.ts` on `round_end`. */
    handleRoundEnd(roundNumber: number): void {
        this.state.abilityUseTracker.clearAbilityUses();
        this.state.lightSourceManager.handleRoundEnd(this.roundNumber);
        this.state.unitManager.onRoundEnd(roundNumber);
        this.state.worldModifierManager.handleRoundEnd(roundNumber);
    }

    /**
     * Round timer milestones (same cadence as UI round progress: 0% and 50%).
     * Use refills run at round start; all DoT effects tick DOT_TICKS_PER_ROUND times per round.
     */
    private processRoundProgressMilestones(roundTime: number): void {
        const bleedFx = {
            addEffect: (e: Effect) => this.addEffect(e),
            generateRandomInteger: (min: number, max: number) => this.generateRandomInteger(min, max),
        };
        if (!this.appliedRoundStartRecovery) {
            const surgeUnit = this.units.find(u => u.isPlayerControlled() && u.isAlive());
            const roundChargeAbilityIds = surgeUnit ? getRoundChargeEligibleAbilityIds(surgeUnit) : [];
            this.eventBus.emit('round_start', {
                roundNumber: this.roundNumber,
                roundChargeCount: roundChargeAbilityIds.length,
                roundChargeAbilityIds,
            });
            this.state.unitManager.onRoundStart(this.roundNumber, this);
            this.state.ninjutsuManager?.onRoundStart(this.roundNumber, countNinjutsuEnemyUnits(this.units));
            this.applyItemRoundStartRecoveryCharges();
            runUnitComponentRoundMilestone('round_start', this.buildUnitComponentContext(0));
            this.appliedRoundStartRecovery = true;
        }
        if (!this.appliedMidRoundRecovery && roundTime >= ROUND_DURATION / 2) {
            runUnitComponentRoundMilestone('round_half', this.buildUnitComponentContext(0));
            this.appliedMidRoundRecovery = true;
        }
        const dotTickInterval = ROUND_DURATION / DOT_TICKS_PER_ROUND;
        while (this.appliedDotTicks < DOT_TICKS_PER_ROUND && roundTime >= this.appliedDotTicks * dotTickInterval) {
            tickAllDots(this.units, this.terrainLayers, this.eventBus, bleedFx, this.appliedDotTicks);
            tickDayLightDamage(this.units, this, this.appliedDotTicks);
            this.appliedDotTicks++;
        }
    }

    /** Context handed to unit-component hooks (see `units/components/unitComponentHooks.ts`). */
    /** @internal used by `engineEventWiring.ts`. */
    buildUnitComponentContext(dt: number): UnitComponentContext {
        return {
            gameTime: this.gameTime,
            dt,
            units: this.units,
            eventBus: this.eventBus,
            engine: this,
            state: this.state,
            addUnit: (u, src) => this.addUnit(u, src),
            mapPOIs: this.mapPOIs,
            mapNetwork: this.state.mapNetworkManager,
            lightLevelEnabled: this.lightLevelEnabled,
            addLightSource: (ls) => this.addLightSource(ls),
            lightSources: this.state.lightSourceManager.lightSources,
            addEffectEmitter: (em) => this.addEffectEmitter(em),
            generateRandomInteger: (min, max) => this.generateRandomInteger(min, max),
        };
    }

    /** Item passives: grants each living unit the recovery charges its equipped items declare, once per round. */
    private applyItemRoundStartRecoveryCharges(): void {
        for (const unit of this.units) {
            if (!unit.isAlive() || unit.roundStartRecoveryCharges.length === 0) continue;
            for (const { chargeType, amount } of unit.roundStartRecoveryCharges) {
                addRecoveryChargeToUnitAbilities(
                    unit,
                    chargeType,
                    amount,
                    (min, max) => this.generateRandomInteger(min, max),
                    this.eventBus,
                );
            }
            syncNestedCardAbilityState(unit);
        }
    }

    // ========================================================================
    // Timing Helpers
    // ========================================================================

    get roundProgress(): number {
        const roundTime = this.gameTime - (this.roundNumber - 1) * ROUND_DURATION;
        return Math.min(1, roundTime / ROUND_DURATION);
    }

    // ========================================================================
    // Serialization
    // ========================================================================

    toJSON(): SerializedGameState {
        return serializeEngine(this);
    }

    /** See `deserializeEngine` in `engineSerialization.ts` (upgrades the checkpoint first). */
    static fromJSON(
        data: SerializedGameState,
        localPlayerId: string,
        terrainManager?: TerrainManager | null,
        opts?: GameEngineFromJSONOpts,
    ): GameEngine {
        return deserializeEngine(() => new GameEngine(), data, localPlayerId, terrainManager, opts);
    }

    /**
     * Pause game simulation for approximately `frames` game ticks (hitpause).
     *
     * PLACEHOLDER (no-op). See `HIT_STOP_DEFAULTS` in `game/time/timeConstants.ts`: a future
     * implementation applies a short tick-time `freeze` TimeModifier to attacker and victim (not
     * world pace), so the rest of the world keeps moving and stored momentum resumes afterwards.
     */
    requestHitPause(frames: number): void {
        void frames;
    }

    destroy(): void {
        this.stop();
        this.deferredOrderPause = null;
        this.terrainManager?.setStoneDamagedEmitter(undefined);
        this.terrainManager?.setTerrainEffectsClearedEmitter(undefined);
        for (const unit of this.units) {
            unit.detachAllResources(this.eventBus);
        }
        this.eventBus.clear();
        this.state.unitManager.units = [];
        this.state.projectileManager.projectiles = [];
        this.state.effectManager.effects = [];
        this.state.effectEmitterManager.emitters = [];
        this.state.specialTileManager.specialTiles = [];
        this.terrainManager?.markNavDirty();
    }
}
