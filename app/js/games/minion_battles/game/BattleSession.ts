/**
 * Owns battle runtime objects (engine, camera, renderer), engine lifecycle,
 * order submission, and GameSync bridge hooks — without React.
 */
import type { PlayerState } from '../../../types';
import type { MessageEntry } from '../../../components/Chat';
import { MessageType } from '../../../MessageTypes';
import type { MinionBattlesApi } from '../api/minionBattlesApi';
import { MISSION_MAP, DARK_AWAKENING } from '../storylines';
import { SPECTATOR_ID, isControlEnemy } from '../state';
import { TerrainManager } from '../terrain/TerrainManager';
import { getSegment, getMissionSegmentZones } from '../terrain/segmentRegistry';
import { debugLog } from '../../../debugLog';
import { logToLobbyLog, logToLobbyLogBattleSync } from '../../../lobbyLog';
import { GameEngine } from './GameEngine';
import { PLAYER_CHARACTER_ID } from './units/unit_defs/unitDef';
import { GameRenderer } from './GameRenderer';
import { Camera } from './Camera';
import { PlayerInteractionManager } from './interaction/PlayerInteractionManager';
import { fingerprintToHex, type FingerprintRingEntry } from './Fingerprint';
import { debugSettingsSnapshot } from '../../../debug/debugSettingsStore';
import type { BattleOrder, SerializedGameState, WaitingForOrders } from './types';
import type { ApplyRemoteOrdersResult, BattleNet, BattleSessionHandle, RemoteOrderWireRow } from './battlenet';
import { hashOrderId } from './battlenet/helpers/orderHashing';
import { summarizeRemoteWireRowsForLog } from './battlenet/helpers/orderWireLogSummary';
import { logUserState } from './battlenet/userStateLog';
import { tickStateHistory } from './tickStateHistory';
import { buildWorldModifiersFromSources } from '../worldModifiers/buildWorldModifiers';
import { BUILTIN_WORLD_MODIFIERS } from '../worldModifiers/builtins/index';
import {
    resolveActiveDarknessStrengths,
    type ResolveActiveDarknessStrengthsInput,
} from '../../../darknessStrength/resolve';
import { compileWorldModifiers } from '../../../darknessStrength/compile';
import { InteractiveTargetingSession, type HeldRemoteOrder } from './interaction/InteractiveTargetingSession';
import { USE_SEQUENTIAL_TARGETING } from '../featureFlags';
import { PERF_UI, PERF_UI_REACT, tickPerformanceTracker } from './performance/tickPerformanceTracker';
import { getAbility } from '../abilities/AbilityRegistry';
import { getInteractiveTargetDefsFromTimings } from '../abilities/targeting';
import { isCasterInConditionalCancelPause } from './interaction/isITSPreviewComplete';

export interface BattleSessionConfig {
    api: MinionBattlesApi;
    missionId: string;
    playerId: string;
    isHost: boolean;
    onVictory?: (missionResult: string) => void;
    onDefeat?: () => void;
    onEmittedChatMessage?: (entry: MessageEntry) => void;
}

export interface BattleSessionLoadArgs {
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
    battleSeed: number;
    initialSnapshot?: SerializedGameState;
    /**
     * Optional DarknessStrength resolve input (campaign instances + overrides + region/mission).
     * When set on a fresh load, resolved packages are installed before enemy spawn so statBags bake in.
     * Snapshot loads restore active packages from serialized crumbs instead.
     */
    darknessStrength?: ResolveActiveDarknessStrengthsInput;
}

export type BattleSessionEvent =
    | {
          type: 'waiting_for_orders';
          engine: GameEngine;
          info: WaitingForOrders;
          source: 'engine_callback' | 'post_full_state_sync';
      }
    | { type: 'round_number'; roundNumber: number }
    | { type: 'round_progress'; progress: number }
    | { type: 'pause_state'; paused: boolean; waitingForOrders: WaitingForOrders | null }
    | { type: 'card_state'; engine: GameEngine }
    | { type: 'order_submit_failed'; unitId: string; abilityId: string }
    | { type: 'sequential_targeting_rewind' };

export type BattleSessionListener = (event: BattleSessionEvent) => void;

type EngineSnapshot = {
    gameTick: number;
    state: Record<string, unknown>;
    waitingForOrders: {
        waiters: Array<{ unitId: string; ownerId: string }>;
        atTick: number;
    } | null;
    synchash: string | null;
};

export class BattleSession implements BattleSessionHandle {
    private engine: GameEngine | null = null;
    private camera: Camera | null = null;
    private renderer: GameRenderer | null = null;
    private interactionManager: PlayerInteractionManager | null = null;
    private players: Record<string, PlayerState> = {};
    private characterSelections: Record<string, string> = {};
    private netAdapter: BattleNet | null = null;
    private initialFingerprint: string | null = null;
    private initialSerializedState: SerializedGameState | null = null;
    /** Debug-only one-shot: force the next heartbeat fingerprint comparison to mismatch. */
    private forceNextFingerprintMismatch = false;
    private readonly listeners = new Set<BattleSessionListener>();
    /** Dedupe keys for remote rows applied this engine lifetime (cleared when the engine is torn down or replaced from snapshot). */
    private appliedRemoteOrderKeys = new Set<string>();
    /**
     * When the UI claims a rewind presentation (DOM crossfade), ITS awaits this before
     * applying orders / unpausing. Headless callers that never defer resolve immediately.
     */
    private rewindPresentationResolve: (() => void) | null = null;
    private rewindPresentationDeferred = false;
    /** Manages the local-preview run for abilities that use SelectTargetDef. */
    readonly interactiveTargeting = new InteractiveTargetingSession();

    constructor(private readonly config: BattleSessionConfig) {}

    /** Latest lobby player data for fresh loads and snapshot restores. */
    updateLobbyContext(players: Record<string, PlayerState>, characterSelections: Record<string, string>): void {
        this.players = players;
        this.characterSelections = characterSelections;
    }

    setNetAdapter(net: BattleNet | null): void {
        this.netAdapter = net;
    }

    subscribe(listener: BattleSessionListener): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private emit(event: BattleSessionEvent): void {
        tickPerformanceTracker.measure([PERF_UI, PERF_UI_REACT], () => {
            for (const l of this.listeners) {
                l(event);
            }
        });
    }

    getEngine(): GameEngine | null {
        return this.engine;
    }

    getCamera(): Camera | null {
        return this.camera;
    }

    getRenderer(): GameRenderer | null {
        return this.renderer;
    }

    getInteractionManager(): PlayerInteractionManager | null {
        return this.interactionManager;
    }

    /**
     * True when this client is the lobby host and the only player slot in the lobby.
     *
     * Counts every key in `this.players` regardless of `PlayerState.isConnected` — a
     * disconnected peer that has not been removed from lobby state still occupies a slot,
     * so in-place commit stays disabled until the lobby shrinks to the host alone.
     * There is no separate AI-player flag on `PlayerState`; co-op allies appear as
     * additional player entries and also force rollback mode.
     */
    isSoloHost(): boolean {
        if (!this.config.isHost) return false;
        const playerIds = Object.keys(this.players);
        return playerIds.length === 1 && playerIds[0] === this.config.playerId;
    }

    isHost(): boolean {
        return this.config.isHost;
    }

    /** True when BattleNet can accept an order POST/defer (not recovering / awaiting resync ack). */
    isInPlaceCommitPersistenceAvailable(): boolean {
        return this.netAdapter?.isOrderSubmitPathAvailable() ?? false;
    }

    /**
     * True when `atTick` is still a valid server order batch (not already completed on the host).
     * Without a net adapter (tests), always true.
     */
    isOrderBatchTickSubmittable(atTick: number): boolean {
        return this.netAdapter?.isOrderBatchTickSubmittable?.(atTick) ?? true;
    }

    /** Heartbeat parallel order batch; null without a net adapter (tests). */
    getHeartbeatOrderBatchAtTick(): number | null {
        return this.netAdapter?.getHeartbeatOrderBatchAtTick?.() ?? null;
    }

    /**
     * True when the heartbeat expects this player to act (or waiters are unknown).
     * Without a net adapter (tests), always true.
     */
    isLocalPlayerExpectedToAct(): boolean {
        return this.netAdapter?.isLocalPlayerExpectedToAct?.() ?? true;
    }

    /**
     * Best-effort fetch of peer orders before ITS reset/replay/commit. No-op without a net adapter.
     */
    async refreshRemoteOrdersBeforeInteractiveTargetingAction(): Promise<void> {
        await this.netAdapter?.refreshRemoteOrdersForTargetingPreview?.();
    }

    /** Re-bind host engine callbacks after an in-place preview commit (begin() nulls batch-resolved). */
    rebindEngineCallbacks(): void {
        const engine = this.engine;
        if (engine) {
            this.bindEngineCallbacks(engine);
        }
    }

    private applyPlayerPortraitOverrides(engine: GameEngine, portraitIds: Record<string, string> | undefined): void {
        if (!portraitIds) return;
        for (const unit of engine.units) {
            if (unit.characterId === PLAYER_CHARACTER_ID && unit.isPlayerControlled() && portraitIds[unit.ownerId]) {
                unit.portraitId = portraitIds[unit.ownerId];
            }
        }
    }

    private bindEngineCallbacks(engine: GameEngine): void {
        const { api, isHost, onEmittedChatMessage } = this.config;
        // Non-host: freeze ITS at local-player parallel pauses (lobby 39E984).
        engine.freezeItsOnLocalPlayerParallelPause = !isHost;
        engine.setOnCheckpoint((gameTick, state) => {
            if (engine.isSequentialTargetingPreview) return;
            if (isHost) {
                void this.netAdapter?.saveSnapshotOnPause(gameTick, state);
            }
        });
        engine.setOnTickComplete((gameTick, fingerprintHex, paused, adminReason) => {
            if (engine.isSequentialTargetingPreview) return;
            if (isHost) {
                this.netAdapter?.queueFingerprint(gameTick, fingerprintHex, paused, adminReason);
            }
            logUserState({ api, playerId: this.config.playerId, engine, fingerprintHex });
        });
        if (isHost) {
            engine.setOnParallelBatchResolved((batchAtTick) => {
                if (engine.isSequentialTargetingPreview) return;
                const merge = this.netAdapter?.mergeAppliedOrdersForBatch(batchAtTick);
                if (merge === undefined || merge === null) {
                    return;
                }
                return Promise.resolve(merge).then((ok) => {
                    if (ok === false) {
                        throw new Error('merge-applied-failed');
                    }
                });
            });
        } else {
            engine.setOnParallelBatchResolved(null);
        }
        engine.setOnEmitMessage((text, npcId) => {
            if (!isHost) return;
            const onSent = (res: { messageId: number; chatEntry?: Record<string, unknown> }) => {
                if (res.chatEntry) onEmittedChatMessage?.(res.chatEntry as MessageEntry);
            };
            if (npcId) {
                api.sendMessage(MessageType.NPC_CHAT, { npcId, message: text }).then(onSent).catch(() => {});
            } else {
                api.sendMessage(MessageType.CHAT, { message: text }).then(onSent).catch(() => {});
            }
        });
        engine.setOnItsParallelPauseDecision((decision, waiters, gameTick) => {
            const localPlayerId = this.config.playerId;
            const newlyUncertain =
                this.interactiveTargeting.isActive
                && waiters.some((w) => w.ownerId !== localPlayerId)
                && this.interactiveTargeting.noteMultiplayerUncertaintyDuringPreview();
            const lobbyClient = typeof api.getLobbyClient === 'function' ? api.getLobbyClient() : null;
            if (!lobbyClient) return;
            if (!newlyUncertain && decision === 'drop') {
                // Skip duplicate lobby lines when waiters persist across preview ticks.
                return;
            }
            logToLobbyLogBattleSync({
                lobbyClient,
                lobbyId: api.getLobbyId(),
                playerId: this.config.playerId,
                tick: gameTick,
                severity: 'info',
                gameId: api.getGameId(),
                message:
                    decision === 'freeze'
                        ? 'ITS: freezing at parallel pause (local player is waiter)'
                        : 'ITS: dropping ally-only parallel pause (preview continues)',
                context: {
                    decision,
                    isHost,
                    waiterOwnerIds: waiters.map((w) => w.ownerId),
                    waiterUnitIds: waiters.map((w) => w.unitId),
                },
            });
        });
    }

    /**
     * Emit pause + waiting_for_orders after preview flags clear (e.g. conditional-cancel in-place commit).
     */
    emitWaitingForOrdersIfPaused(): void {
        const engine = this.engine;
        if (!engine?.waitingForOrders) return;
        this.emit({
            type: 'waiting_for_orders',
            engine,
            info: engine.waitingForOrders,
            source: 'engine_callback',
        });
        this.emit({
            type: 'pause_state',
            paused: true,
            waitingForOrders: engine.waitingForOrders,
        });
    }

    /**
     * Fallback when a terminal outcome fires with preview flags set but no live ITS session
     * (e.g. flags orphaned after an external teardown): clear flags and surface the outcome.
     */
    private teardownSequentialTargetingPreviewForTerminalOutcome(engine: GameEngine): void {
        engine.isSequentialTargetingPreview = false;
        engine.sequentialTargetingPreviewCast = null;
        engine.waitingForTargetInput = null;
        if (this.interactiveTargeting.isActive) {
            this.interactiveTargeting.endPreviewForTerminalOutcome(this);
        }
        this.rebindEngineCallbacks();
    }

    /** Guards re-entry while a terminal-outcome auto-commit is awaiting network. */
    private terminalPreviewAutoCommitInFlight = false;

    /**
     * Victory/defeat latched during ITS preview playahead. The killing order exists only in the
     * local preview sim, so the outcome must not be surfaced until the order is persisted —
     * otherwise other clients (and the server) never see the kill and desync.
     *
     * Routes through {@link InteractiveTargetingSession.commit}:
     * - In-place commit persists the finalized order, then `reemitSuppressedTerminalOutcome`
     *   fires the victory/defeat UI.
     * - Rollback commit restores the mark (discarding the preview's terminal state) and resubmits
     *   via BattleNet; the outcome re-fires naturally when the authoritative sim reaches the kill.
     * - A failed commit restores the pre-preview pause with no outcome UI — correct, since the
     *   kill never happened authoritatively.
     */
    private commitPreviewForTerminalOutcome(engine: GameEngine): void {
        if (this.terminalPreviewAutoCommitInFlight) return;
        if (!this.interactiveTargeting.isActive) {
            this.teardownSequentialTargetingPreviewForTerminalOutcome(engine);
            this.reemitSuppressedTerminalOutcome(engine);
            return;
        }
        this.terminalPreviewAutoCommitInFlight = true;
        void this.interactiveTargeting
            .commit(this, 'terminal_outcome_auto_commit')
            .finally(() => {
                this.terminalPreviewAutoCommitInFlight = false;
            });
    }

    private finalizeEngine(engine: GameEngine): void {
        const mission = MISSION_MAP[this.config.missionId] ?? DARK_AWAKENING;
        // Defs are runtime-only; re-register after fromJSON so late spawns still assign.
        // Fresh load already registered in initializeGameState — this is idempotent.
        engine.registerPlayerControl(
            mission.playerControl ?? [],
            { ...engine.getNpcControlAssignments() },
        );
        if (this.renderer) {
            this.renderer.localTeamId = engine.getLocalPlayerTeamId();
        }
        const { onVictory, onDefeat } = this.config;
        engine.registerBattleObjectives(mission.battleObjectives ?? []);
        engine.state.worldModifierManager.install(
            buildWorldModifiersFromSources({
                builtins: BUILTIN_WORLD_MODIFIERS,
                campaign: compileWorldModifiers(engine.activeDarknessStrengths),
                mission: mission.worldModifiers,
            }),
        );
        this.engine = engine;
        this.emit({ type: 'round_number', roundNumber: engine.roundNumber });
        this.emit({ type: 'round_progress', progress: engine.roundProgress });
        this.emit({ type: 'pause_state', paused: !!engine.waitingForOrders, waitingForOrders: engine.waitingForOrders });

        engine.setOnWaitingForOrders((info) => {
            if (engine.isSequentialTargetingPreview) return;
            this.emit({
                type: 'waiting_for_orders',
                engine,
                info,
                source: 'engine_callback',
            });
        });
        this.bindEngineCallbacks(engine);
        engine.eventBus.on('ability_bar_changed', () => {
            if (engine.isSequentialTargetingPreview) return;
            this.emit({ type: 'card_state', engine });
        });
        engine.setOnRoundEnd((rn) => {
            if (engine.isSequentialTargetingPreview) return;
            this.emit({ type: 'round_number', roundNumber: rn + 1 });
            this.emit({ type: 'card_state', engine });
        });
        engine.setOnStateChanged(() => {
            if (engine.isSequentialTargetingPreview) return;
            this.emit({ type: 'round_progress', progress: engine.roundProgress });
            this.emit({ type: 'round_number', roundNumber: engine.roundNumber });
        });
        if (onVictory) {
            engine.setOnVictory((result) => {
                if (engine.isSequentialTargetingPreview) {
                    this.commitPreviewForTerminalOutcome(engine);
                    return;
                }
                onVictory(result);
            });
        }
        if (onDefeat) {
            engine.setOnDefeat(() => {
                if (engine.isSequentialTargetingPreview) {
                    this.commitPreviewForTerminalOutcome(engine);
                    return;
                }
                onDefeat();
            });
        }
        const myUnit = engine.getLocalPlayerUnit();
        if (myUnit && this.camera) {
            this.camera.snapTo(myUnit.x, myUnit.y, myUnit.radius);
        }
        this.emit({ type: 'card_state', engine });
        if (engine.waitingForOrders) {
            this.emit({
                type: 'waiting_for_orders',
                engine,
                info: engine.waitingForOrders,
                source: 'post_full_state_sync',
            });
        } else {
            engine.isPaused = false;
        }
        engine.clearDeferredOrderPauseAndAccumulator();
    }

    /** Start the simulation loop (RAF). Call after host has persisted tick-0 initial state when appropriate. Idempotent with GameEngine.start. */
    startEngine(): void {
        const eng = this.engine;
        if (!eng) {
            return;
        }
        if (this.camera && this.renderer) {
            this.interactionManager?.destroy();
            this.interactionManager = new PlayerInteractionManager();
            this.interactionManager.setContext({
                engine: eng,
                camera: this.camera,
                renderer: this.renderer,
                session: this,
                playerId: this.config.playerId,
            });
        }
        eng.start();
    }

    /**
     * Deterministic load: always initialize from mission + seed.
     * Optional initial snapshot is used only for metadata and mismatch fallback.
     */
    async load({
        players,
        characterSelections,
        battleSeed,
        initialSnapshot,
        darknessStrength,
    }: BattleSessionLoadArgs): Promise<void> {
        this.updateLobbyContext(players, characterSelections);
        this.appliedRemoteOrderKeys.clear();
        this.teardownEngineAndRendererOnly();
        const { api, playerId, missionId, isHost } = this.config;
        api.setCurrentPlayerId();
        let renderer = this.renderer;
        if (!renderer) {
            renderer = new GameRenderer();
            this.renderer = renderer;
        }
        const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
        const terrainGrid = mission.createTerrain();
        const terrainManager = new TerrainManager(terrainGrid);
        const camera = new Camera(800, 600, terrainGrid.worldWidth, terrainGrid.worldHeight);
        this.camera = camera;
        renderer.setTerrain(terrainManager);
        renderer.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);

        const snapshotRecord = (initialSnapshot ?? null) as Record<string, unknown> | null;
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
        const equippedItemsByPlayer = (snapshotRecord?.playerEquipmentByPlayer as Record<string, string[]> | undefined) ?? {};
        const playerResearchTreesByPlayer =
            (snapshotRecord?.playerResearchTreesByPlayer as Record<string, Record<string, string[]>> | undefined) ?? {};
        const playerResearchNodeLevelsByPlayer =
            (snapshotRecord?.playerResearchNodeLevelsByPlayer as
                | Record<string, Record<string, Record<string, number>>>
                | undefined) ?? {};
        const questPrepLoadoutsByPlayer =
            (snapshotRecord?.questPrepLoadoutsByPlayer as Record<string, string[]> | undefined) ?? undefined;
        const questAbilityLoadoutsByCharacterId =
            (snapshotRecord?.questAbilityLoadoutsByCharacterId as Record<string, string[]> | undefined)
            ?? undefined;
        const missionPrepLoadoutsByPlayer =
            (snapshotRecord?.missionPrepLoadoutsByPlayer as Record<string, string[]> | undefined)
            ?? undefined;

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
        const terrainSegmentPOIs = mission.segmentIds.flatMap((id) => getSegment(id)?.pointsOfInterest ?? []);
        const terrainSegmentZones = getMissionSegmentZones(mission.segmentIds);
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
            terrainSegmentPOIs,
            terrainSegmentZones,
        });
        engine.initNinjutsu(mission.ninjutsuPools);
        engine.applyInstantLightingPass();
        engine.setPlayerResearchTreesByPlayer(playerResearchTreesByPlayer);
        this.applyPlayerPortraitOverrides(engine, portraitIds);
        this.initialFingerprint = engine.computeInitialFingerprint();
        this.initialSerializedState = engine.toJSON();
        this.finalizeEngine(engine);
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
                    initialFingerprint: this.initialFingerprint,
                    characterSelectionsOrdered: selectionKeys.map((id) => [id, selections[id]]),
                    equippedItemsByPlayer,
                },
            });
        }
    }

    private static readonly RESYNC_CAMERA_KEY = 'mb_camera_resync_state';

    /** Replace simulation from a full serialized snapshot (host resync / reconnect). */
    loadFromSnapshot(
        gameState: SerializedGameState,
        opts?: { checkpointRuntimeFingerprintHex?: string | null },
    ): void {
        const raw = gameState as unknown as Record<string, unknown>;
        debugLog('sync tracking', 'warn', 'BattleSession.loadFromSnapshot', {
            gameTick: raw.gameTick ?? raw.game_tick,
            snapshotIndex: raw.snapshotIndex,
        });
        // If an interactive targeting preview is in progress, abort it before replacing the engine.
        // The mark/preview state is no longer valid after resync, so we just clear without restoring.
        if (this.interactiveTargeting.isActive) {
            this.interactiveTargeting.abort(this, 'resync_load_from_snapshot');
        }
        if (this.camera) {
            localStorage.setItem(
                BattleSession.RESYNC_CAMERA_KEY,
                JSON.stringify({ x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom }),
            );
        }
        this.appliedRemoteOrderKeys.clear();
        this.teardownEngineAndRendererOnly();
        const { api, playerId, missionId } = this.config;
        api.setCurrentPlayerId();
        let renderer = this.renderer;
        if (!renderer) {
            renderer = new GameRenderer();
            this.renderer = renderer;
        }
        const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
        const terrainGrid = mission.createTerrain();
        const terrainManager = new TerrainManager(terrainGrid);
        const camera = new Camera(800, 600, terrainGrid.worldWidth, terrainGrid.worldHeight);
        this.camera = camera;
        renderer.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
        const engine = GameEngine.fromJSON(gameState, playerId, terrainManager, {
            ...opts,
            segmentIds: mission.segmentIds,
        });
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
        this.applyPlayerPortraitOverrides(engine, snapshotPortraitIds);
        this.finalizeEngine(engine);
        // Replacing the engine calls destroy() on the previous instance, which stops its rAF loop.
        // BattlePhase only calls startEngine() once on mount; async resync paths must restart here.
        this.startEngine();
        const savedCamera = localStorage.getItem(BattleSession.RESYNC_CAMERA_KEY);
        if (savedCamera) {
            localStorage.removeItem(BattleSession.RESYNC_CAMERA_KEY);
            try {
                const { x, y, zoom } = JSON.parse(savedCamera) as { x: number; y: number; zoom: number };
                this.camera.setZoomLevel(zoom);
                this.camera.snapTo(x, y);
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
    restoreFromInMemorySnapshot(snapshot: SerializedGameState): void {
        const { playerId, missionId } = this.config;
        // Preserve current camera state before teardown.
        const savedCamera = this.camera
            ? { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom }
            : null;
        // Keep dedupe keys so BattleNet poll does not re-apply orders already applied before
        // this restore (e.g. ITS commit/reset/replay after a local preview).
        const preservedRemoteOrderKeys = new Set(this.appliedRemoteOrderKeys);
        this.appliedRemoteOrderKeys.clear();
        this.teardownEngineAndRendererOnly();
        const { api } = this.config;
        api.setCurrentPlayerId();
        let renderer = this.renderer;
        if (!renderer) {
            renderer = new GameRenderer();
            this.renderer = renderer;
        }
        const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
        const terrainGrid = mission.createTerrain();
        const terrainManager = new TerrainManager(terrainGrid);
        const camera = new Camera(800, 600, terrainGrid.worldWidth, terrainGrid.worldHeight);
        this.camera = camera;
        renderer.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
        const engine = GameEngine.fromJSON(snapshot, playerId, terrainManager, {
            checkpointRuntimeFingerprintHex: snapshot.checkpointRuntimeFingerprintHex,
            segmentIds: mission.segmentIds,
        });
        renderer.setTerrain(terrainManager);
        if (!engine.state.ninjutsuManager) {
            engine.initNinjutsu(mission.ninjutsuPools);
        }
        engine.setMissionLightConfig(mission.lightLevelEnabled ?? true, mission.globalLightLevel ?? 0);
        if (mission.levelEvents && mission.levelEvents.length > 0) {
            engine.setLevelEvents(mission.levelEvents);
        }
        this.finalizeEngine(engine);
        for (const key of preservedRemoteOrderKeys) {
            this.appliedRemoteOrderKeys.add(key);
        }
        this.startEngine();
        // Restore camera to what it was before the preview (no localStorage involved).
        if (savedCamera) {
            this.camera.setZoomLevel(savedCamera.zoom);
            this.camera.snapTo(savedCamera.x, savedCamera.y);
        }
    }

    /** Same as {@link load} for a new or reconnecting battle with optional lobby payload. */
    loadFreshMission(init: Record<string, unknown> | null | undefined): void {
        const battleSeed = typeof init?.battleSeed === 'number' ? init.battleSeed : 1;
        void this.load({
            players: this.players,
            characterSelections: this.characterSelections,
            battleSeed,
            initialSnapshot: (init as SerializedGameState | undefined) ?? undefined,
        });
    }

    async compareInitialFingerprintWithHeartbeat(headFingerprint: string | null): Promise<boolean> {
        if (headFingerprint == null) return false;
        if (!this.initialFingerprint || headFingerprint === this.initialFingerprint) return false;
        return (await this.netAdapter?.recoverFromLobbyInitialFingerprintMismatch()) ?? false;
    }

    /** Debug helper used by Battle Actions tab to intentionally trigger one desync recovery. */
    triggerDebugDesyncOnce(): void {
        this.forceNextFingerprintMismatch = true;
    }

    /** Debug helper: reload the battle from the initial state and replay all orders. */
    async replayMissionFromStart(): Promise<void> {
        await this.netAdapter?.replayMissionFromStart();
    }

    getEngineTick(): number {
        return this.engine?.gameTick ?? 0;
    }

    /** POST info-level battle-sync line to the lobby log when a lobby client is available. */
    postBattleSyncLobbyLog(message: string, context?: Record<string, unknown>, tick?: number | null): void {
        const { api, playerId } = this.config;
        const lobbyClient = typeof api.getLobbyClient === 'function' ? api.getLobbyClient() : null;
        if (!lobbyClient) return;
        logToLobbyLogBattleSync({
            lobbyClient,
            lobbyId: api.getLobbyId(),
            playerId,
            tick: tick ?? this.getEngineTick(),
            severity: 'info',
            gameId: api.getGameId(),
            message,
            context,
        });
    }

    getRuntimeFingerprintHex(): string {
        return this.engine?.getRuntimeFingerprintHex() ?? '';
    }

    getFingerprintTailPaused(): boolean {
        return this.engine?.getFingerprintTailPaused() ?? false;
    }

    isPausedForOrderSync(): boolean {
        return this.engine?.waitingForOrders != null;
    }

    isInteractiveTargetingPreviewActive(): boolean {
        return this.interactiveTargeting.isActive;
    }

    getLocalPlayerId(): string {
        return this.config.playerId;
    }

    hasDeferredOrderFor(unitId: string, atTick: number): boolean {
        return this.netAdapter?.hasDeferredOrderFor?.(unitId, atTick) ?? false;
    }

    /** True when a wire dedupe key was registered by apply/submit (order consumed or queued). */
    hasRemoteOrderDedupeKey(key: string): boolean {
        return this.appliedRemoteOrderKeys.has(key);
    }

    /** Non-host: fixed-step sim is frozen until `gameTick <=` heartbeat host completed tail. */
    isMultiplayerAwaitHostCatchup(): boolean {
        return this.engine?.state.multiplayerAwaitHostCatchup ?? false;
    }

    setMultiplayerAwaitHostCatchup(blocked: boolean): void {
        const eng = this.engine;
        if (!eng) return;
        eng.state.multiplayerAwaitHostCatchup = blocked;
    }

    getWaitingForOrdersBatch(): WaitingForOrders | null {
        return this.engine?.waitingForOrders ?? null;
    }

    isDebugSimulationFrozen(): boolean {
        return debugSettingsSnapshot.debugPauseMode === true;
    }

    /** True while the battle engine loop is running (`GameEngine.start` … `stop`). */
    isEngineSimulationRunning(): boolean {
        return this.engine?.isSimulationLoopRunning ?? false;
    }

    /** `paused`: end-of-tick pause flag mirrored to host fingerprints.jsonl (see `GameEngine` tick end). */
    getLatestFingerprint(): { tick: number; fp: string; paused: boolean } | null {
        const latest = this.engine?.state.runtimeFingerprintRing.latest();
        if (!latest) return null;
        const fp = fingerprintToHex(latest.fp);
        if (!this.forceNextFingerprintMismatch) {
            return { tick: latest.tick, fp, paused: latest.paused };
        }
        this.forceNextFingerprintMismatch = false;
        // Deliberately return a different hash for one compare cycle only.
        const forced = fp === 'ffffffffffffffff' ? '0000000000000000' : 'ffffffffffffffff';
        return { tick: latest.tick, fp: forced, paused: latest.paused };
    }

    getFingerprintRange(from: number, to: number): Array<{ tick: number; fp: string; paused: boolean }> {
        return (this.engine?.state.runtimeFingerprintRing.range(from, to) ?? []).map((entry: FingerprintRingEntry) => ({
            tick: entry.tick,
            fp: fingerprintToHex(entry.fp),
            paused: entry.paused,
        }));
    }

    getInitialFingerprint(): string {
        return this.initialFingerprint ?? '';
    }

    getSerializedSnapshot(): SerializedGameState {
        if (!this.engine) {
            throw new Error('BattleSession.getSerializedSnapshot called before load');
        }
        return this.engine.toJSON();
    }

    getSerializedInitialState(): SerializedGameState {
        if (this.initialSerializedState) {
            return this.initialSerializedState;
        }
        return this.getSerializedSnapshot();
    }

    getPayloadForPersistedInitialStateOrNull(): {
        state: SerializedGameState;
        initialFingerprint: string;
    } | null {
        if (this.initialSerializedState == null) {
            return null;
        }
        const fp = this.initialFingerprint;
        if (fp == null || fp === '') {
            return null;
        }
        return { state: this.initialSerializedState, initialFingerprint: fp };
    }

    /** Snapshot for GameSyncContext polling / hash verification. */
    getSnapshot(): EngineSnapshot | null {
        const eng = this.engine;
        if (!eng) return null;
        const w = eng.waitingForOrders;
        return {
            gameTick: eng.gameTick,
            state: eng.toJSON() as unknown as Record<string, unknown>,
            waitingForOrders: w
                ? {
                      waiters: w.waiters.map((x) => ({ unitId: x.unitId, ownerId: x.ownerId })),
                      atTick: w.atTick,
                  }
                : null,
            synchash: eng.getRuntimeFingerprintHex(),
        };
    }

    /**
     * Align {@link BattleSession.appliedRemoteOrderKeys} with {@link OrderQueueController.seedAppliedHashesForMergedOrdersThroughTick}.
     */
    seedRemoteOrderDedupeKeys(keys: readonly string[]): void {
        for (const k of keys) {
            if (typeof k === 'string' && k.length > 0) {
                this.appliedRemoteOrderKeys.add(k);
            }
        }
    }

    /**
     * Release held remote orders (from {@link InteractiveTargetingSession}) after a preview ends.
     * For each row: skip if the key is already in `appliedRemoteOrderKeys`, queue the order,
     * register the key, then call `tryResumeParallel` once if any row was queued.
     */
    applyHeldRemoteOrders(rows: HeldRemoteOrder[]): void {
        const engine = this.engine;
        if (!engine) return;
        let anyQueued = false;
        for (const { atTick, order, key } of rows) {
            if (key != null && this.appliedRemoteOrderKeys.has(key)) {
                // Already applied before or during the preview — skip to prevent double-application.
                continue;
            }
            engine.state.orderMgr.queueOrder(atTick, order);
            if (key != null) {
                this.appliedRemoteOrderKeys.add(key);
            }
            anyQueued = true;
        }
        if (anyQueued) {
            engine.tryResumeParallel();
        }
    }

    /** Apply orders delivered from the server for non-host (or late host) clients. */
    applyRemoteOrders(orders: RemoteOrderWireRow[]): ApplyRemoteOrdersResult {
        const newlyAppliedKeys: string[] = [];
        const skippedKeys: string[] = [];
        // While an interactive targeting preview is running, hold all remote orders so they
        // don't interfere with the local preview engine state. They will be applied after
        // the preview ends (commit/reset/replay all call _restoreToMark which applies held orders).
        if (this.interactiveTargeting.isActive) {
            for (const row of orders) {
                const atTick = row.atTick ?? row.gameTick;
                if (typeof atTick !== 'number' || Number.isNaN(atTick)) continue;
                const order = row.order as BattleOrder;
                const idWire = row.idHash;
                const keyFromWire = typeof idWire === 'string' && idWire.length > 0 ? idWire : null;
                const playerId = typeof row.playerId === 'string' && row.playerId.length > 0 ? row.playerId : null;
                const key =
                    keyFromWire ??
                    (playerId != null ? hashOrderId(playerId, atTick, order) : null);
                if (key != null && this.appliedRemoteOrderKeys.has(key)) {
                    // Already applied before the preview started — skip entirely.
                    skippedKeys.push(key);
                    continue;
                }
                this.interactiveTargeting.holdRemoteOrder(atTick, order, key);
            }
            return { newlyAppliedKeys, skippedKeys };
        }
        const eng = this.engine;
        if (!eng) {
            return { newlyAppliedKeys, skippedKeys };
        }
        const engineTickBeforeApply = eng.gameTick;
        for (const rec of orders) {
            const atTick = rec.atTick ?? rec.gameTick;
            if (typeof atTick !== 'number' || Number.isNaN(atTick)) {
                continue;
            }
            const idWire = rec.idHash;
            const keyFromWire = typeof idWire === 'string' && idWire.length > 0 ? idWire : null;
            const playerId = typeof rec.playerId === 'string' && rec.playerId.length > 0 ? rec.playerId : null;
            const key =
                keyFromWire ??
                (playerId != null ? hashOrderId(playerId, atTick, rec.order as BattleOrder) : null);
            if (key == null) {
                continue;
            }
            if (this.appliedRemoteOrderKeys.has(key)) {
                skippedKeys.push(key);
                continue;
            }
            // Non-host: never clamp a past-batch order onto the current tick (lobby 39E984).
            // Mark as applied for dedupe; BattleNet soft-align / recovery repairs the pause plane.
            if (!this.config.isHost && atTick < eng.gameTick) {
                this.appliedRemoteOrderKeys.add(key);
                skippedKeys.push(key);
                continue;
            }
            const order = rec.order;
            eng.state.orderMgr.queueOrder(atTick, order as unknown as BattleOrder);
            this.appliedRemoteOrderKeys.add(key);
            newlyAppliedKeys.push(key);
        }
        eng.tryResumeParallel();
        this.emit({
            type: 'pause_state',
            paused: !!eng.waitingForOrders,
            waitingForOrders: eng.waitingForOrders,
        });
        this.emit({ type: 'card_state', engine: eng });
        const wAfter = eng.waitingForOrders;
        const lobbyClient = this.config.api.getLobbyClient?.();
        if (orders.length > 0 && lobbyClient) {
            logToLobbyLogBattleSync({
                lobbyClient,
                lobbyId: this.config.api.getLobbyId(),
                playerId: this.config.playerId,
                tick: eng.gameTick,
                severity: 'info',
                gameId: this.config.api.getGameId(),
                message:
                    'BattleSession.applyRemoteOrders: engine state after queueOrder (same effectiveTick+unitId replaces pending row)',
                context: {
                    engineTickBeforeApply,
                    engineTickAfter: eng.gameTick,
                    incomingRows: summarizeRemoteWireRowsForLog(orders),
                    newlyAppliedKeys,
                    skippedKeys,
                    pendingOrdersAfter: eng.pendingOrders.map((o) => ({
                        gameTick: o.gameTick,
                        unitId: o.order.unitId,
                        abilityId: o.order.abilityId,
                    })),
                    waitingForOrdersAfter:
                        wAfter == null
                            ? null
                            : {
                                  atTick: wAfter.atTick,
                                  waiterUnitIds: wAfter.waiters.map((x) => x.unitId),
                              },
                },
            });
        }
        return { newlyAppliedKeys, skippedKeys };
    }

    /**
     * Local player submits an order at the current pause point.
     * Caller clears movement preview; session validates against the live engine.
     * Does not advance the engine until BattleNet submit resolves.
     *
     * When USE_SEQUENTIAL_TARGETING is on and the ability has SelectTargetDefs,
     * delegates to InteractiveTargetingSession.begin() instead of submitting immediately.
     */
    async submitPlayerOrder(order: BattleOrder, opts: { canSubmitOrders: boolean }): Promise<void> {
        const engine = this.engine;
        if (!engine) return;

        let batch = engine.waitingForOrders;
        if (!batch || !opts.canSubmitOrders) return;
        if (!batch.waiters.some((w) => w.unitId === order.unitId)) return;

        const caster = engine.getUnit(order.unitId);
        const conditionalCancelFollowUp = isCasterInConditionalCancelPause(caster);

        // Defense in depth: deferred-first-select ITS leaves waitingForOrders set, so Wait/Space
        // could otherwise POST a wait for the open batch (lobby 10EA88). Commit uses
        // submitCommittedTargetingOrder / persistInPlaceCommittedTargetingOrder instead.
        if (this.interactiveTargeting.isActive) {
            if (!conditionalCancelFollowUp) {
                this.postBattleSyncLobbyLog('submitPlayerOrder blocked: ITS preview active', {
                    abilityId: order.abilityId,
                    unitId: order.unitId,
                    endTurn: order.endTurn === true,
                });
                return;
            }
            await this.interactiveTargeting.commit(this, 'conditional_cancel_follow_up');
            if (this.interactiveTargeting.isActive) return;
            // In-place commit replaces waitingForOrders when realigning atTick (lobby C9D014).
            batch = engine.waitingForOrders;
            if (!batch || !batch.waiters.some((w) => w.unitId === order.unitId)) return;
        }

        // Stale pause plane (lobby F6E500): do not start ITS or POST on a completed batch.
        if (!this.isOrderBatchTickSubmittable(batch.atTick) || !this.isLocalPlayerExpectedToAct()) {
            this.emitOrderSubmitFailed(order.unitId, order.abilityId);
            return;
        }

        if (USE_SEQUENTIAL_TARGETING && !conditionalCancelFollowUp) {
            const ability = getAbility(order.abilityId);
            if (ability && caster && getInteractiveTargetDefsFromTimings(ability, caster, engine).length > 0) {
                if (this.interactiveTargeting.begin(order, this)) {
                    return;
                }
            }
        }

        await this.netAdapter?.submitOrder(order, batch.atTick);
    }

    /**
     * Submit the confirmed order after interactive targeting rollback commit (bypasses begin() routing).
     * @returns true when the order landed (pending row, deferred POST, or registered dedupe after local apply).
     */
    async submitCommittedTargetingOrder(order: BattleOrder, atTick: number): Promise<boolean> {
        if (!this.netAdapter) {
            return false;
        }
        const unitId = order.unitId;
        const idHash = hashOrderId(this.config.playerId, atTick, order);
        await this.netAdapter.submitOrder(order, atTick);
        if (this.appliedRemoteOrderKeys.has(idHash)) {
            return true;
        }
        if (this.netAdapter.hasDeferredOrderFor?.(unitId, atTick)) {
            return true;
        }
        const engine = this.engine;
        if (engine?.state.orderMgr.hasPendingEndTurnOrderForUnit(unitId, atTick)) {
            return true;
        }
        return false;
    }

    /**
     * In-place interactive commit: persist the finalized order without re-applying it locally.
     * Host: append + merge via {@link BattleNet.persistCommittedOrder}.
     * Non-host: POST via {@link BattleNet.submitOrder} with `skipLocalApply` (deferral gates unchanged).
     * Registers the wire dedupe key in {@link appliedRemoteOrderKeys} on success.
     */
    async persistInPlaceCommittedTargetingOrder(order: BattleOrder, atTick: number): Promise<boolean> {
        if (!this.netAdapter) return false;
        const pathAvailable = this.netAdapter.isOrderSubmitPathAvailable();
        if (!pathAvailable) return false;

        const idHash = hashOrderId(this.config.playerId, atTick, order);

        if (this.config.isHost) {
            const ok = await this.netAdapter.persistCommittedOrder(order, atTick);
            if (ok) {
                this.appliedRemoteOrderKeys.add(idHash);
            }
            return ok;
        }

        await this.netAdapter.submitOrder(order, atTick, { skipLocalApply: true });
        const deferred = this.netAdapter.hasDeferredOrderFor(order.unitId, atTick);
        if (deferred) {
            return false;
        }
        this.appliedRemoteOrderKeys.add(idHash);
        return true;
    }

    /**
     * Re-fire victory/defeat UI callbacks when a terminal result latched during preview
     * (`LevelEventManager.isTerminal`) but was swallowed by `isSequentialTargetingPreview` guards.
     */
    reemitSuppressedTerminalOutcome(engine: GameEngine): void {
        const outcome = engine.state.levelEventManager.getTerminalOutcome();
        if (!outcome) {
            return;
        }
        if (outcome.kind === 'victory') {
            this.config.onVictory?.(outcome.missionResult);
        } else {
            this.config.onDefeat?.();
        }
    }

    /** Emit an order_submit_failed event to all session listeners. */
    emitOrderSubmitFailed(unitId: string, abilityId: string): void {
        this.emit({ type: 'order_submit_failed', unitId, abilityId });
    }

    /**
     * Emit a sequential_targeting_rewind event (UI captures the frame before restore).
     * Resolves when the rewind presentation may end — immediately unless the UI calls
     * {@link deferRewindPresentationUntilNotified} synchronously in a listener, then
     * {@link notifyRewindPresentationComplete} after the crossfade.
     */
    emitSequentialTargetingRewind(): Promise<void> {
        const prev = this.rewindPresentationResolve;
        this.rewindPresentationResolve = null;
        this.rewindPresentationDeferred = false;
        prev?.();

        return new Promise((resolve) => {
            this.rewindPresentationResolve = resolve;
            this.emit({ type: 'sequential_targeting_rewind' });
            if (!this.rewindPresentationDeferred) {
                this.rewindPresentationResolve = null;
                resolve();
            }
        });
    }

    /**
     * UI: call from the `sequential_targeting_rewind` handler so ITS holds sim resume
     * until {@link notifyRewindPresentationComplete}.
     */
    deferRewindPresentationUntilNotified(): void {
        this.rewindPresentationDeferred = true;
    }

    /** UI: call when the rewind crossfade finishes (or is cancelled). */
    notifyRewindPresentationComplete(): void {
        const resolve = this.rewindPresentationResolve;
        this.rewindPresentationResolve = null;
        this.rewindPresentationDeferred = false;
        resolve?.();
    }

    /** Host: force a wait order and persist checkpoint (skip turn). */
    skipTurn(): void {
        const engine = this.engine;
        const batch = engine?.waitingForOrders;
        if (!batch || !this.config.isHost) return;
        const atTick = batch.atTick;
        for (const waiter of batch.waiters) {
            const unit = engine.getUnit(waiter.unitId);
            if (!unit?.isPlayerControlled()) continue;
            if (engine.state.orderMgr.hasPendingOrderForUnit(waiter.unitId, atTick)) continue;
            engine.state.orderMgr.queueOrder(atTick, {
                unitId: waiter.unitId,
                abilityId: 'wait',
                targets: [],
            });
        }
        engine.tryResumeParallel();
        this.emit({
            type: 'pause_state',
            paused: !!engine.waitingForOrders,
            waitingForOrders: engine.waitingForOrders,
        });
        this.emit({ type: 'card_state', engine });
        for (const waiter of batch.waiters) {
            if (waiter.ownerId !== this.config.playerId) continue;
            const unit = engine.getUnit(waiter.unitId);
            if (!unit?.isPlayerControlled()) continue;
            void this.netAdapter?.submitOrder(
                {
                    unitId: waiter.unitId,
                    abilityId: 'wait',
                    targets: [],
                },
                atTick,
            );
        }
    }

    private teardownEngineAndRendererOnly(): void {
        const prevEngine = this.engine;
        const renderer = this.renderer;
        if (prevEngine && renderer) {
            renderer.unbindFromEngine(prevEngine);
        }
        prevEngine?.destroy();
        this.engine = null;
        this.camera = null;
        this.appliedRemoteOrderKeys.clear();
    }

    /** Full teardown (unmount). */
    destroy(): void {
        const net = this.netAdapter;
        this.netAdapter = null;
        if (net != null && typeof (net as { stop?: () => void }).stop === 'function') {
            (net as { stop: () => void }).stop();
        }
        this.interactionManager?.destroy();
        this.interactionManager = null;
        this.teardownEngineAndRendererOnly();
        this.renderer?.destroy();
        this.renderer = null;
        this.listeners.clear();
        this.initialFingerprint = null;
        this.initialSerializedState = null;
        tickStateHistory.clear();
    }
}
