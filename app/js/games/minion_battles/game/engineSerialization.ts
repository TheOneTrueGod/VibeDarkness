/**
 * Checkpoint (de)serialization for `GameEngine`, moved out of the class as a pure move.
 * `GameEngine.toJSON` / `GameEngine.fromJSON` are thin wrappers over these functions.
 *
 * Checkpoint versioning rules live in the `game-engine` skill and `serializedGameStateUpgrade.ts`:
 * `deserializeEngine` upgrades the raw JSON before it reads anything.
 */

import { getDarknessStrength } from '../../../darknessStrength/registry';
import type { ActiveDarknessStrength } from '../../../darknessStrength/resolve';
import type { DarknessStrengthInstance } from '../../../darknessStrength/types';
import { getMissionSegmentNetwork, getMissionSegmentPlacements } from '../terrain/segmentRegistry';
import type { TerrainManager } from '../terrain/TerrainManager';
import { NinjutsuManager } from './ninjutsu/NinjutsuManager';
import { LightTileGrid } from './lightTileGrid/LightTileGrid';
import { TerrainLayerManager } from './TerrainLayerManager';
import { DOT_TICKS_PER_ROUND } from './dotTick';
import { clearUnitTileTransitionState } from './terrainEffects/tileTransitions';
import { PLAYER_CHARACTER_ID } from './units/unit_defs/unitDef';
import { ROUND_DURATION } from './gameConstants';
import { fingerprintFromHex, fingerprintInitial } from './Fingerprint';
import { SERIALIZED_GAME_STATE_VERSION, upgradeSerializedGameState } from './serializedGameStateUpgrade';
import { tickPerformanceTracker } from './performance/tickPerformanceTracker';
import {
    normalizeWaitingForOrdersFromJSON,
    type GameEngineFromJSONOpts,
    type OrderWaiter,
    type SerializedGameState,
} from './types';
import type { GameEngine } from './GameEngine';

function fieldObjectsJSON(engine: GameEngine): Pick<SerializedGameState, 'droppedWeapons' | 'sentries'> {
    const saved = engine.state.fieldObjects.toJSON();
    if (saved.droppedWeapons.length === 0 && saved.sentries.length === 0) return {};
    return { droppedWeapons: saved.droppedWeapons, sentries: saved.sentries };
}

export function serializeEngine(engine: GameEngine): SerializedGameState {
    const levelEventData = engine.state.levelEventManager.toJSON();
    const performanceLog = tickPerformanceTracker.getLastPerformanceLog();
    return {
        serializationVersion: SERIALIZED_GAME_STATE_VERSION,
        // Deploy compatibility for pre-versioning clients; see `SerializedGameState.cards`.
        cards: {},
        randomSeed: engine.randomSeed,
        enemyScalingPlayerCount: engine.enemyScalingPlayerCount,
        gameTime: engine.gameTime,
        gameTick: engine.gameTick,
        roundNumber: engine.roundNumber,
        snapshotIndex: engine.snapshotIndex,
        ...(engine.state.timeManager.isDefault() ? {} : { timeManager: engine.state.timeManager.toJSON() }),
        navEpoch: engine.terrainManager?.navEpoch ?? 0,
        units: engine.state.unitManager.toJSON(engine.gameTick),
        projectiles: engine.state.projectileManager.toJSON(),
        effectEmitters: engine.state.effectEmitterManager.toJSON(),
        waitingForOrders: engine.waitingForOrders
            ? {
                  waiters: engine.waitingForOrders.waiters,
                  atTick: engine.waitingForOrders.atTick,
              }
            : null,
        orders: engine.pendingOrders.map((o) => ({ gameTick: o.gameTick, order: { ...o.order, targets: o.order.targets.map((t) => ({ ...t })) } })),
        specialTiles: engine.state.specialTileManager.toJSON() as unknown as import('./types').SerializedSpecialTile[],
        ...fieldObjectsJSON(engine),
        aiControllerId: engine.aiControllerId,
        firedEventIndices: levelEventData.firedEventIndices,
        victoryCheckFirstEmitDone: levelEventData.victoryCheckFirstEmitDone,
        continuousSpawnLastSpawnedAt: levelEventData.continuousSpawnLastSpawnedAt,
        playerResearchTreesByPlayer: engine.state.researchManager.toJSON(),
        storyPauseActive: engine.storyPauseActive,
        storyPauseReason: engine.storyPauseReason,
        storyPauseEndsAt: engine.storyPauseEndsAt,
        objectives: engine.state.objectiveManager.toJSON(),
        worldModifiers: engine.state.worldModifierManager.toJSON(),
        ...(engine.state.activeDarknessStrengths.length > 0
            ? {
                  activeDarknessStrengths: engine.state.activeDarknessStrengths.map(
                      ({ packageId, data }): DarknessStrengthInstance =>
                          data !== undefined ? { packageId, data } : { packageId },
                  ),
              }
            : {}),
        ...(Object.keys(engine.state.darknessUpgradeBonuses).length > 0
            ? { darknessUpgradeBonuses: structuredClone(engine.state.darknessUpgradeBonuses) }
            : {}),
        ...(engine.state.darknessUpgradeNodeIds.length > 0
            ? { darknessUpgradeNodeIds: [...engine.state.darknessUpgradeNodeIds] }
            : {}),
        lightSources: engine.state.lightSourceManager.toJSON(),
        terrainEffects: engine.state.terrainLayers.toEffectsJSON(),
        floorTiles: engine.state.terrainLayers.toFloorTilesJSON(),
        lightTileGrid: engine.state.lightTileGrid?.toJSON() ?? null,
        nextObjectId: engine.objectIdSeq,
        mapPOIs: engine.mapPOIs,
        mapZones: engine.mapZones,
        mapNetwork: engine.state.mapNetworkManager.toJSON(),
        groups: engine.state.groupManager.toJSON(engine.gameTick),
        ninjutsuPools: engine.state.ninjutsuManager?.toJSON() ?? undefined,
        ...(Object.keys(engine.npcControl.assignments).length > 0
            ? { npcControlAssignments: { ...engine.npcControl.assignments } }
            : {}),
        ...(performanceLog != null ? { performanceLog } : {}),
    };
}

/**
 * NOTE: reload/resync (`BattleSession.loadFromSnapshot`/`restoreFromInMemorySnapshot`) rebuilds
 * the engine straight from JSON, independently of `mission.initializeGameState`. Any addition
 * to that method which is *not* serialized (re-derived from `opts.segmentIds`/mission config
 * rather than persisted) must be replicated here too, or it will be lost on reload.
 *
 * `createEngine` is `() => new GameEngine()`, passed in so this module has no runtime import of the class.
 */
export function deserializeEngine(
    createEngine: () => GameEngine,
    data: SerializedGameState,
    localPlayerId: string,
    terrainManager?: TerrainManager | null,
    opts?: GameEngineFromJSONOpts,
): GameEngine {
    // Single entry point for every checkpoint load: bring old formats up to date first.
    data = upgradeSerializedGameState(data);
    const engine = createEngine();
    engine.localPlayerId = localPlayerId;
    engine.terrainManager = terrainManager ?? null;
    engine.terrainManager?.setStoneDamagedEmitter((event) => {
        engine.eventBus.emit('terrain_stone_damaged', event);
    });
    engine.terrainManager?.setTerrainEffectsClearedEmitter((cleared) => {
        engine.eventBus.emit('terrain_effects_cleared', { cleared });
    });
    engine.randomSeed = data.randomSeed ?? 0;
    engine.gameTime = data.gameTime;
    engine.gameTick = data.gameTick ?? 0;
    engine.roundNumber = data.roundNumber;
    engine.snapshotIndex = data.snapshotIndex;
    engine.state.timeManager.restoreFromJSON(data.timeManager);
    engine.waitingForOrders = normalizeWaitingForOrdersFromJSON(data.waitingForOrders, engine.gameTick);
    engine.aiControllerId = data.aiControllerId ?? null;
    engine.storyPauseActive = data.storyPauseActive ?? false;
    engine.storyPauseReason = data.storyPauseReason ?? null;
    engine.storyPauseEndsAt = data.storyPauseEndsAt ?? null;

    engine.state.levelEventManager.restoreFromJSON({
        firedEventIndices: data.firedEventIndices,
        victoryCheckFirstEmitDone: data.victoryCheckFirstEmitDone,
        continuousSpawnLastSpawnedAt: data.continuousSpawnLastSpawnedAt,
    });

    engine.state.objectiveManager.importSnapshot(data.objectives);
    engine.state.worldModifierManager.importSnapshot(data.worldModifiers ?? null);
    engine.setActiveDarknessStrengths(
        (data.activeDarknessStrengths ?? [])
            .map((inst): ActiveDarknessStrength | null => {
                const def = getDarknessStrength(inst.packageId);
                if (!def) return null;
                return inst.data !== undefined
                    ? { packageId: inst.packageId, data: inst.data, def }
                    : { packageId: inst.packageId, def };
            })
            .filter((a): a is ActiveDarknessStrength => a != null),
    );

    engine.darknessUpgradeBonuses = data.darknessUpgradeBonuses ? structuredClone(data.darknessUpgradeBonuses) : {};
    engine.darknessUpgradeNodeIds = data.darknessUpgradeNodeIds ? [...data.darknessUpgradeNodeIds] : [];

    engine.pendingOrders = (data.orders ?? []).map((o) => ({
        gameTick: o.gameTick,
        order: { ...o.order, targets: (o.order.targets ?? []).map((t) => ({ ...t })) },
    }));

    // Restore units (direct push, bypasses addUnit jitter since state is serialized)
    engine.state.unitManager.restoreFromJSON(data.units, engine.eventBus, engine.gameTick);

    // Roster size is frozen at mission start; legacy checkpoints omit it — recover from heroes present.
    engine.enemyScalingPlayerCount =
        data.enemyScalingPlayerCount ??
        Math.max(
            1,
            engine.units.filter(
                (u) => u.characterId === PLAYER_CHARACTER_ID && u.isPlayerControlled(),
            ).length,
        );

    // Some checkpoints only list a subset of parallel waiters (e.g. host order already saved).
    // Without merging, we would clear pause while another human's unit still owes an order,
    // the host would not run GET /minimal, and remote orders would never apply.
    if (engine.waitingForOrders) {
        const pauseBatch = engine.waitingForOrders;
        const { waiters, atTick } = pauseBatch;
        const waiterUnitIds = new Set(waiters.map((w) => w.unitId));
        const extra: OrderWaiter[] = [];
        for (const unit of engine.units) {
            if (!unit.active || !unit.isAlive()) continue;
            // Frozen units never owe orders (OrderManager.shouldPauseForOrders).
            if (!unit.isPlayerControlled() || !unit.canAct() || unit.localFrozen) continue;
            if (waiterUnitIds.has(unit.id)) continue;
            // Drafts don't count as having answered; only confirmed orders satisfy a waiter's pause.
            if (!engine.state.orderMgr.hasConfirmedOrderForUnit(unit.id, atTick)) {
                extra.push({ unitId: unit.id, ownerId: unit.ownerId });
            }
        }
        if (extra.length > 0) {
            extra.sort((a, b) =>
                a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
            );
            const merged = [...waiters, ...extra].sort((a, b) =>
                a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
            );
            engine.waitingForOrders = {
                waiters: merged,
                atTick,
                ...(pauseBatch.teamworkCancelledOwnerIds !== undefined
                    ? { teamworkCancelledOwnerIds: pauseBatch.teamworkCancelledOwnerIds }
                    : {}),
            };
        }
    }

    // Parallel orders must be queued at waitingForOrders.atTick. Only the canonical deferred-
    // pause shape (atTick === gameTick + 1) is normalized: older checkpoints sometimes store
    // waiter rows at `gameTick` instead of `atTick`. Never rewrite when `atTick` drifts further
    // ahead — that would bump legitimate intermediate ticks and stall or corrupt the timeline.
    if (engine.waitingForOrders && engine.waitingForOrders.atTick === engine.gameTick + 1) {
        const { waiters, atTick } = engine.waitingForOrders;
        const waiterIds = new Set(waiters.map((w) => w.unitId));
        for (const entry of engine.pendingOrders) {
            const uid = entry.order.unitId;
            if (!waiterIds.has(uid)) continue;
            if (entry.gameTick === engine.gameTick && entry.gameTick < atTick) {
                entry.gameTick = atTick;
            }
        }
    }

    // Backward-compat: old snapshots stored conditionalCancelContext on waitingForOrders.
    // Migrate: set conditionalCancelPaused + conditionalCancelTagFilter on the matching ability.
    {
        const rawWFO = (data.waitingForOrders ?? null) as Record<string, unknown> | null;
        const rawCC = rawWFO?.conditionalCancelContext;
        if (rawCC && typeof rawCC === 'object') {
            const cc = rawCC as Record<string, unknown>;
            if (typeof cc.unitId === 'string' && typeof cc.activeAbilityId === 'string') {
                const unit = engine.getUnit(cc.unitId);
                const active = unit?.activeAbilities.find((a) => a.abilityId === cc.activeAbilityId);
                if (active && !active.conditionalCancelPaused) {
                    active.conditionalCancelPaused = true;
                    const tagFilter = Array.isArray(cc.abilityTagFilter)
                        ? (cc.abilityTagFilter as unknown[]).filter((t): t is string => typeof t === 'string')
                        : undefined;
                    active.conditionalCancelTagFilter = tagFilter;
                }
            }
        }
    }

    // If every waiter already has a confirmed order at the batch tick, clear pause.
    if (engine.waitingForOrders) {
        const { waiters, atTick } = engine.waitingForOrders;
        if (waiters.every((w) => engine.state.orderMgr.hasConfirmedOrderForUnit(w.unitId, atTick))) {
            engine.waitingForOrders = null;
            engine.isPaused = false;
        }
    }

    // Restore projectiles
    engine.state.projectileManager.restoreFromJSON(data.projectiles);

    // Restore effect emitters (runtime-only factories are dropped; emitters are short-lived)
    engine.state.effectEmitterManager.restoreFromJSON(data.effectEmitters ?? []);

    // Restore terrain layers (floor/ground/air effects) BEFORE special tiles
    // so the TerrainManager can be fully set up before crystal protection is queried.
    engine.state.terrainLayers = TerrainLayerManager.fromJSON(data.terrainEffects ?? [], data.floorTiles ?? []);
    if (engine.terrainManager) {
        engine.terrainManager.setTerrainLayers(engine.state.terrainLayers);
        engine.terrainManager.setCrystalProtectionProvider(
            () => engine.state.specialTileManager.getCrystalProtectionMap(),
        );
    }

    // Restore special tiles AFTER terrain layers and crystal provider setup
    engine.state.specialTileManager.restoreFromJSON(data.specialTiles ?? []);
    engine.state.fieldObjects.restoreFromJSON({
        droppedWeapons: data.droppedWeapons ?? [],
        sentries: data.sentries ?? [],
    });

    // Restore navEpoch and mark NavGrid dirty (after special tiles are restored)
    if (engine.terrainManager) {
        engine.terrainManager.navEpoch = data.navEpoch ?? 0;
        engine.terrainManager.markNavDirty();
    }

    // Restore light sources
    engine.state.lightSourceManager.restoreFromJSON(data.lightSources ?? []);

    // Restore light tile grid
    engine.state.lightTileGrid = data.lightTileGrid ? LightTileGrid.fromJSON(data.lightTileGrid) : null;

    // Restore map POIs (needed for networked lanternite nest spawning)
    engine.registerMapPOIs((data.mapPOIs ?? []) as import('../terrain/segmentSchema').MapSegmentPOI[]);

    // Restore map zones (needed for spawn behaviours that run deterministically on every client)
    engine.registerMapZones((data.mapZones ?? []) as import('../terrain/segmentSchema').MapSegmentZone[]);

    // Restore map network graph. Deliberately NOT restored from `data.mapNetwork` (always an
    // empty no-op payload, see `SerializedGameState.mapNetwork`'s doc comment) — rebuilt fresh
    // from segment data instead, mirroring `mission.initializeGameState`'s own
    // `loadFromSegments` call. This restore path runs independently of
    // `initializeGameState` (checkpoint/resync callers construct a fresh engine straight from
    // JSON), so `opts.segmentIds` is the only way the graph gets populated here.
    engine.state.mapNetworkManager.restoreFromJSON(data.mapNetwork);
    const networkPayload = opts?.segmentNetwork
        ?? (opts?.segmentIds ? getMissionSegmentNetwork(opts.segmentIds) : null);
    if (networkPayload) {
        engine.state.mapNetworkManager.loadFromSegments(networkPayload);
        // Unit restoration (engine.state.unitManager.restoreFromJSON) already ran earlier in
        // this function, so engine.units is populated here — seed membership once, same as
        // the mission-init path in BaseMissionDef.initializeGameState.
        engine.state.mapNetworkManager.buildInitialMembership(engine.units);
    }
    if (engine.terrainManager) {
        if (opts?.segmentPlacements) {
            engine.terrainManager.segmentPlacements = opts.segmentPlacements;
        } else if (opts?.segmentIds) {
            engine.terrainManager.segmentPlacements = getMissionSegmentPlacements(opts.segmentIds);
        }
    }

    // Restore research trees
    engine.state.researchManager.restoreFromJSON(data.playerResearchTreesByPlayer);

    // Restore group blackboards (AI strategic layer)
    engine.state.groupManager.fromJSON(data.groups ?? [], data.gameTick ?? 0);

    // Restore ninjutsu pools (config + runtime budget/delay)
    if (data.ninjutsuPools && data.ninjutsuPools.length > 0) {
        engine.state.ninjutsuManager = NinjutsuManager.fromJSON(data.ninjutsuPools);
    }

    // Assignments only — defs are re-registered by BattleSession from the mission def.
    engine.npcControl.assignments = data.npcControlAssignments
        ? { ...data.npcControlAssignments }
        : {};

    engine.syncObjectIdsFromSnapshot(data);

    // Re-register core event listeners
    engine.registerCoreEventListeners();

    // Infer parallel waiters for legacy checkpoints that omit the field.
    if (!engine.waitingForOrders) {
        const inferredWaiters: OrderWaiter[] = [];
        for (const unit of engine.units) {
            if (!unit.active) continue;
            // Frozen units never owe orders (OrderManager.shouldPauseForOrders).
            if (unit.isPlayerControlled() && unit.canAct() && unit.isAlive() && !unit.localFrozen) {
                // Drafts don't count as confirmed; re-infer if only drafts exist from this tick on.
                if (!engine.state.orderMgr.hasConfirmedOrderForUnit(unit.id, engine.gameTick)) {
                    inferredWaiters.push({ unitId: unit.id, ownerId: unit.ownerId });
                }
            }
        }
        inferredWaiters.sort((a, b) =>
            a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
        );
        if (inferredWaiters.length > 0) {
            engine.waitingForOrders = { waiters: inferredWaiters, atTick: engine.gameTick + 1 };
            engine.isPaused = true;
        }
    }

    const roundTime = engine.gameTime - (engine.roundNumber - 1) * ROUND_DURATION;
    engine.appliedRoundStartRecovery = roundTime > 0;
    engine.appliedMidRoundRecovery = roundTime >= ROUND_DURATION / 2;
    engine.appliedDotTicks = Math.min(DOT_TICKS_PER_ROUND, Math.floor(roundTime / (ROUND_DURATION / DOT_TICKS_PER_ROUND)));
    clearUnitTileTransitionState();
    // CrowdSpacing grid is ephemeral — never restore from JSON; rebuild on first tick.
    engine.crowdSpacingManager.clear();
    // Pathfinding manager and caches are ephemeral — never restore from JSON; rebuild on first tick.
    engine.pathfindingManager.clear();
    engine.terrainManager?.pathQuery.clearCache();

    engine.deferredOrderPause = null;
    if (engine.waitingForOrders != null) {
        engine.isPaused = true;
    }

    const checkpointFromData =
        typeof data.checkpointRuntimeFingerprintHex === 'string' && data.checkpointRuntimeFingerprintHex !== ''
            ? data.checkpointRuntimeFingerprintHex
            : undefined;
    const checkpointHex = opts?.checkpointRuntimeFingerprintHex ?? checkpointFromData;
    const legacyLayoutHex = typeof data.initialFingerprint === 'string' ? data.initialFingerprint : '';
    if (typeof checkpointHex === 'string' && checkpointHex !== '') {
        engine.runtimeFingerprint = fingerprintFromHex(checkpointHex);
    } else if (legacyLayoutHex !== '') {
        engine.runtimeFingerprint = fingerprintFromHex(legacyLayoutHex);
    } else if (engine.gameTick === 0) {
        engine.runtimeFingerprint = fingerprintFromHex(engine.computeInitialFingerprint());
    } else {
        engine.runtimeFingerprint = fingerprintInitial();
    }
    if (engine.gameTick > 0) {
        const pausedRestore =
            engine.isPaused ||
            engine.waitingForOrders != null ||
            engine.deferredOrderPause != null ||
            engine.storyPauseActive;
        engine.state.runtimeFingerprintRing.push(engine.gameTick, engine.runtimeFingerprint, pausedRestore);
    }

    return engine;
}
