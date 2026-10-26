/**
 * BattleSession load paths: fresh deterministic load, full-snapshot resync and in-memory restore.
 * Pure moves out of `BattleSession`; each takes the session as its first argument.
 */
import { MISSION_MAP, DARK_AWAKENING } from '../storylines';
import { SPECTATOR_ID, isControlEnemy } from '../state';
import { TerrainManager } from '../terrain/TerrainManager';
import { getMissionSegmentPOIs, getMissionSegmentZones } from '../terrain/segmentRegistry';
import { mergePartyResearch, terrainContextFromSnapshot } from '../storylines/homeBase';
import { activeResearchByPlayer, activeResearchNodeLevelsByPlayer } from '../character_defs/characterLoadout';
import type { HomeResolveContext } from '../storylines/homeBase';
import type { IBaseMissionDef } from '../storylines/BaseMissionDef';
import type { GameEngineFromJSONOpts, SerializedGameState } from './types';
import { debugLog } from '../../../debugLog';
import { logToLobbyLog } from '../../../lobbyLog';
import { GameEngine } from './GameEngine';
import { GameRenderer } from './GameRenderer';
import { Camera } from './Camera';
import type { LoadFromSnapshotOpts } from './battlenet';
import { resolveActiveDarknessStrengths } from '../../../darknessStrength/resolve';
import type { PassiveBonuses } from '../../../researchTrees/types';
import type { BattleSession, BattleSessionLoadArgs } from './BattleSession';
import { finalizeEngine } from './sessionEngineBinding';

function segmentRestoreOpts(
    mission: IBaseMissionDef,
    ctx?: HomeResolveContext,
): Pick<GameEngineFromJSONOpts, 'segmentIds' | 'segmentPlacements' | 'segmentNetwork'> {
    const composed = mission.composeMap(ctx);
    if (composed) {
        return { segmentPlacements: composed.placements, segmentNetwork: composed.network };
    }
    return { segmentIds: mission.segmentIds };
}

const RESYNC_CAMERA_KEY = 'mb_camera_resync_state';

/**
 * Deterministic load: always initialize from mission + seed.
 * Optional initial snapshot is used only for metadata and mismatch fallback.
 */
export async function loadSession(
    session: BattleSession,
    {
    players,
    characterSelections,
    battleSeed,
    initialSnapshot,
    darknessStrength,
    darknessUpgradeBonuses,
    darknessUpgradeNodeIds,
}: BattleSessionLoadArgs,
): Promise<void> {
    session.updateLobbyContext(players, characterSelections);
    session.appliedRemoteOrderKeys.clear();
    session.ordersBakedThroughTick = -1;
    session.teardownEngineAndRendererOnly();
    const { api, playerId, missionId, isHost } = session.config;
    api.setCurrentPlayerId();
    let renderer = session.renderer;
    if (!renderer) {
        renderer = new GameRenderer();
        session.renderer = renderer;
    }
    const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
    const snapshotRecord = (initialSnapshot ?? null) as Record<string, unknown> | null;
    const equippedItemsByPlayer = (snapshotRecord?.playerEquipmentByPlayer as Record<string, string[]> | undefined) ?? {};
    // Active research only (inactive weapon trees dropped, virtual roots added). Idempotent, so
    // it is safe whether the snapshot holds raw or already-active research.
    const playerResearchTreesByPlayer = activeResearchByPlayer(
        equippedItemsByPlayer,
        snapshotRecord?.playerResearchTreesByPlayer as Record<string, Record<string, string[]>> | undefined,
    );
    const terrainCtx = { researchTrees: mergePartyResearch(playerResearchTreesByPlayer) };
    const composed = mission.composeMap(terrainCtx);
    const terrainGrid = mission.createTerrain(terrainCtx);
    const terrainManager = new TerrainManager(terrainGrid);
    const camera = new Camera(800, 600, terrainGrid.worldWidth, terrainGrid.worldHeight);
    session.camera = camera;
    renderer.setTerrain(terrainManager);
    renderer.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);

    const selections =
        Object.keys(characterSelections).length > 0
            ? characterSelections
            : ((snapshotRecord?.characterSelections ?? snapshotRecord?.character_selections) as Record<string, string>) ?? {};
    const portraitIds = (snapshotRecord?.characterPortraitIds ?? snapshotRecord?.character_portrait_ids) as
        | Record<string, string>
        | undefined;
    const displayNamesRaw =
        (snapshotRecord?.characterDisplayNames ?? snapshotRecord?.character_display_names) as
            | Record<string, string>
            | undefined;
    const playerUnits = Object.entries(selections)
        .filter(([, charId]) => charId !== SPECTATOR_ID && !isControlEnemy(charId))
        .map(([pid]) => {
            const dn = displayNamesRaw?.[pid]?.trim();
            const fallback = players[pid]?.name ?? 'Unknown';
            return {
                playerId: pid,
                name: dn && dn !== '' ? dn : fallback,
                portraitId: portraitIds?.[pid],
            };
        });
    const playerResearchNodeLevelsByPlayer = activeResearchNodeLevelsByPlayer(
        equippedItemsByPlayer,
        snapshotRecord?.playerResearchNodeLevelsByPlayer as
            | Record<string, Record<string, Record<string, number>>>
            | undefined,
    );
    const questPrepLoadoutsByPlayer =
        (snapshotRecord?.questPrepLoadoutsByPlayer as Record<string, string[]> | undefined) ?? undefined;
    const questAbilityLoadoutsByCharacterId =
        (snapshotRecord?.questAbilityLoadoutsByCharacterId as Record<string, string[]> | undefined)
        ?? undefined;
    const missionPrepLoadoutsByPlayer =
        (snapshotRecord?.missionPrepLoadoutsByPlayer as Record<string, string[]> | undefined)
        ?? undefined;
    const playerHungerDeltaByPlayer =
        (snapshotRecord?.playerHungerDeltaByPlayer as Record<string, number> | undefined) ?? {};
    const playerHungerStartFractionByPlayer =
        (snapshotRecord?.playerHungerStartFractionByPlayer as Record<string, number> | undefined) ?? {};

    const engine = new GameEngine();
    engine.prepareForNewGame({
        localPlayerId: playerId,
        randomSeed: battleSeed,
        terrainManager,
        aiControllerId: mission.aiController,
    });
    engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
    if (mission.levelEvents && mission.levelEvents.length > 0) {
        engine.setLevelEvents(mission.levelEvents);
    }
    // Install before initializeGameState so enemy (and player) spawns bake statBags.
    if (darknessStrength) {
        engine.setActiveDarknessStrengths(resolveActiveDarknessStrengths(darknessStrength));
    }
    engine.darknessUpgradeBonuses = {
        ...(darknessUpgradeBonuses ?? (snapshotRecord?.darknessUpgradeBonuses as PassiveBonuses | undefined) ?? {}),
    };
    engine.darknessUpgradeNodeIds = [
        ...(darknessUpgradeNodeIds ?? (snapshotRecord?.darknessUpgradeNodeIds as string[] | undefined) ?? []),
    ];
    const terrainSegmentPOIs = composed?.pois ?? getMissionSegmentPOIs(mission.segmentIds);
    const terrainSegmentZones = composed?.zones ?? getMissionSegmentZones(mission.segmentIds);
    mission.initializeGameState(engine, {
        playerUnits,
        characterSelections: selections,
        localPlayerId: playerId,
        eventBus: engine.eventBus,
        terrainManager,
        equippedItemsByPlayer,
        playerResearchTreesByPlayer,
        playerResearchNodeLevelsByPlayer,
        questPrepLoadoutsByPlayer,
        questAbilityLoadoutsByCharacterId,
        missionPrepLoadoutsByPlayer,
        playerHungerDeltaByPlayer,
        playerHungerStartFractionByPlayer,
        terrainSegmentPOIs,
        terrainSegmentZones,
    });
    engine.initNinjutsu(mission.ninjutsuPools);
    engine.applyInstantLightingPass();
    engine.setPlayerResearchTreesByPlayer(playerResearchTreesByPlayer);
    session.applyPlayerPortraitOverrides(engine, portraitIds);
    session.initialFingerprint = engine.computeInitialFingerprint();
    session.initialSerializedState = engine.toJSON();
    finalizeEngine(session, engine);
    if (isHost && typeof api.getLobbyClient === 'function') {
        const selectionKeys = Object.keys(selections).sort();
        void logToLobbyLog({
            lobbyClient: api.getLobbyClient(),
            lobbyId: api.getLobbyId(),
            playerId,
            tick: 0,
            severity: 'info',
            logType: 'debug',
            gameId: api.getGameId(),
            gamePhase: 'battle',
            message: 'battle initial fingerprint inputs',
            context: {
                missionId,
                battleSeed,
                initialFingerprint: session.initialFingerprint,
                characterSelectionsOrdered: selectionKeys.map((id) => [id, selections[id]]),
                equippedItemsByPlayer,
            },
        });
    }
}

/**
 * Replace simulation from a full serialized snapshot (host resync / reconnect).
 * `ordersBakedThroughTick` is required: the caller must say which orders the snapshot already contains
 * (checkpoint envelope tick `T` → `T`; tick-0 initial state → -1).
 */
export function loadSessionFromSnapshot(
    session: BattleSession,
    gameState: SerializedGameState,
    opts: LoadFromSnapshotOpts,
): void {
    const raw = gameState as unknown as Record<string, unknown>;
    debugLog('sync tracking', 'warn', 'BattleSession.loadFromSnapshot', {
        gameTick: raw.gameTick ?? raw.game_tick,
        snapshotIndex: raw.snapshotIndex,
    });
    // If an interactive targeting preview is in progress, abort it before replacing the engine.
    // The mark/preview state is no longer valid after resync, so we just clear without restoring.
    if (session.interactiveTargeting.isActive) {
        session.interactiveTargeting.abort(session, 'resync_load_from_snapshot');
    }
    if (session.camera) {
        localStorage.setItem(
            RESYNC_CAMERA_KEY,
            JSON.stringify({ x: session.camera.x, y: session.camera.y, zoom: session.camera.zoom }),
        );
    }
    session.appliedRemoteOrderKeys.clear();
    session.teardownEngineAndRendererOnly();
    const { api, playerId, missionId } = session.config;
    api.setCurrentPlayerId();
    let renderer = session.renderer;
    if (!renderer) {
        renderer = new GameRenderer();
        session.renderer = renderer;
    }
    const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
    const terrainCtx = terrainContextFromSnapshot(gameState as unknown as Record<string, unknown>);
    const terrainGrid = mission.createTerrain(terrainCtx);
    const terrainManager = new TerrainManager(terrainGrid);
    const camera = new Camera(800, 600, terrainGrid.worldWidth, terrainGrid.worldHeight);
    session.camera = camera;
    renderer.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
    const engine = GameEngine.fromJSON(gameState, playerId, terrainManager, {
        checkpointRuntimeFingerprintHex: opts.checkpointRuntimeFingerprintHex,
        ...segmentRestoreOpts(mission, terrainCtx),
    });
    session.ordersBakedThroughTick = opts.ordersBakedThroughTick;
    renderer.setTerrain(terrainManager);
    // Fallback for snapshots predating ninjutsu serialization: re-init from mission config.
    if (!engine.state.ninjutsuManager) {
        engine.initNinjutsu(mission.ninjutsuPools);
    }
    engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
    if (mission.levelEvents && mission.levelEvents.length > 0) {
        engine.setLevelEvents(mission.levelEvents);
    }
    const snapshotPortraitIds = (raw.characterPortraitIds ?? raw.character_portrait_ids) as
        | Record<string, string>
        | undefined;
    session.applyPlayerPortraitOverrides(engine, snapshotPortraitIds);
    finalizeEngine(session, engine);
    // Replacing the engine calls destroy() on the previous instance, which stops its rAF loop.
    // BattlePhase only calls startEngine() once on mount; async resync paths must restart here.
    session.startEngine();
    const savedCamera = localStorage.getItem(RESYNC_CAMERA_KEY);
    if (savedCamera) {
        localStorage.removeItem(RESYNC_CAMERA_KEY);
        try {
            const { x, y, zoom } = JSON.parse(savedCamera) as { x: number; y: number; zoom: number };
            session.camera.setZoomLevel(zoom);
            session.camera.snapTo(x, y);
        } catch {
            // ignore malformed data
        }
    }
}

/**
 * Restore engine to an in-memory snapshot taken earlier in the same session.
 * Used by {@link InteractiveTargetingSession} to rewind after a local preview run.
 * Unlike {@link loadFromSnapshot}, this does NOT fetch from the server and does NOT
 * save/restore the camera from localStorage — it preserves the current camera directly.
 */
export function restoreSessionFromInMemorySnapshot(session: BattleSession, snapshot: SerializedGameState): void {
    const { playerId, missionId } = session.config;
    // Preserve current camera state before teardown.
    const savedCamera = session.camera
        ? { x: session.camera.x, y: session.camera.y, zoom: session.camera.zoom }
        : null;
    // Keep dedupe keys so BattleNet poll does not re-apply orders already applied before
    // this restore (e.g. ITS commit/reset/replay after a local preview).
    const preservedRemoteOrderKeys = new Set(session.appliedRemoteOrderKeys);
    session.appliedRemoteOrderKeys.clear();
    session.teardownEngineAndRendererOnly();
    const { api } = session.config;
    api.setCurrentPlayerId();
    let renderer = session.renderer;
    if (!renderer) {
        renderer = new GameRenderer();
        session.renderer = renderer;
    }
    const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
    const terrainCtx = terrainContextFromSnapshot(snapshot as unknown as Record<string, unknown>);
    const terrainGrid = mission.createTerrain(terrainCtx);
    const terrainManager = new TerrainManager(terrainGrid);
    const camera = new Camera(800, 600, terrainGrid.worldWidth, terrainGrid.worldHeight);
    session.camera = camera;
    renderer.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
    const engine = GameEngine.fromJSON(snapshot, playerId, terrainManager, {
        checkpointRuntimeFingerprintHex: snapshot.checkpointRuntimeFingerprintHex,
        ...segmentRestoreOpts(mission, terrainCtx),
    });
    renderer.setTerrain(terrainManager);
    if (!engine.state.ninjutsuManager) {
        engine.initNinjutsu(mission.ninjutsuPools);
    }
    engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
    if (mission.levelEvents && mission.levelEvents.length > 0) {
        engine.setLevelEvents(mission.levelEvents);
    }
    finalizeEngine(session, engine);
    for (const key of preservedRemoteOrderKeys) {
        session.appliedRemoteOrderKeys.add(key);
    }
    session.startEngine();
    // Restore camera to what it was before the preview (no localStorage involved).
    if (savedCamera) {
        session.camera.setZoomLevel(savedCamera.zoom);
        session.camera.snapTo(savedCamera.x, savedCamera.y);
    }
}
