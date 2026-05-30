/**
 * BattlePhase - Main battle phase component.
 *
 * Orchestrates BattleSession (engine / camera / renderer), PixiJS canvas, card hand,
 * round tracking, targeting flow, order submission, and server sync.
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerState, GameSidebarInfo } from '../../../../types';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import type { GameEngine } from '../../game/GameEngine';
import type { SerializedGameState } from '../../game/types';
import type { OrderWaiter, WaitingForOrders, BattleOrder, ResolvedTarget } from '../../game/types';
import { BattleSession } from '../../game/BattleSession';
import {
    createBattleNet,
    type BattleNet,
    type BattleNetSyncTerminalStatus,
    BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS,
} from '../../game/battlenet';
import { resolveClick, validateAndResolveTarget, getSelectTargetDefsFromTimings } from '../../abilities/targeting';
import { resolveHitbox } from '../../abilities/hitboxDef';
import type { AbilityStatic } from '../../abilities/Ability';
import { getAbilityTargets } from '../../abilities/Ability';
import { getAbility } from '../../abilities/AbilityRegistry';
import { TERRAIN_PROPERTIES } from '../../terrain/TerrainType';
import { getLightGrid } from '../../game/LightGrid';
import {
    PLAYER_MOVE_WAYPOINT_MAX,
    buildPlayerMovePathThroughWaypoints,
} from '../../terrain/playerMovePath';
import BattleCanvas from '../components/BattleCanvas';
import ObjectiveMarkerOverlay from '../components/ObjectiveMarkerOverlay';
import CardHand from '../components/CardHand';
import TurnIndicator from '../components/TurnIndicator';
import BattleTimeline from '../components/BattleTimeline';
import { WaitAbility } from '../../abilities/WaitAbility';
import BattleSyncStatus from '../components/BattleSyncStatus';
import BattleHostAnchorBanner from '../components/BattleHostAnchorBanner';
import BossFightHud from '../components/boss/BossFightHud';
import type { BossHudSlice } from '../components/boss/BossFightHud';
import { getBossSpecialMoveCharges } from '../components/boss/bossSignatureHud';
import { UnitTag } from '../../game/units/unitTag';
import type { MessageEntry } from '../../../../components/Chat';
import { computeSynchash } from '@/utils/synchash';
import { logToLobbyLog } from '../../../../lobbyLog';
import { useBattleActionRowHost } from '../../../../contexts/BattleActionRowContext';
import { fetchBattleAssets } from '../../game/fetchBattleAssets';
import { MISSION_MAP, DARK_AWAKENING } from '../../storylines';

declare global {
    interface Window {
        __minionBattlesDebugMouse?: {
            worldX: number;
            worldY: number;
            row: number;
            col: number;
            terrainName: string;
            lightLevel: number | null;
        };
        /**
         * Debug focus/outline: used by DebugConsole when the user hovers a unit in the UI.
         * When unitId is null, the highlight is cleared.
         */
        __minionBattlesDebugSetUnitHover?: (unitId: string | null) => void;
        /**
         * When > Date.now(), BattleCanvas pauses auto-follow centering to give debug camera focus time.
         */
        __minionBattlesDebugAutoFollowPausedUntil?: number;
        /** Live game tick from engine; DebugConsole polls this for up-to-date display. */
        __minionBattlesDebugGameTick?: number;
        /** Live serialized engine state; DebugConsole Units tab polls this for up-to-date unit data. */
        __minionBattlesDebugGameState?: Record<string, unknown> | null;
        /** Client synchash of live engine state (Game State debug tab). */
        __minionBattlesDebugSynchash?: string;
        /**
         * Battle Actions debug button sets this one-shot flag; BattlePhase consumes and clears it.
         */
        __minionBattlesDebugTriggerDesyncRequested?: boolean;
        /** Debug Console → BattleNet: lobby_log (critical) + host snapshot POST from live engine. */
        __minionBattlesDebugLogLocalStateToLobby?: () => Promise<void>;
        /** Admin command: fully heal a unit (debug/host only). */
        __minionBattlesAdminHealUnit?: (unitId: string) => void;
        /** Admin command: kill a unit (debug/host only). */
        __minionBattlesAdminKillUnit?: (unitId: string) => void;
        /** Admin command: teleport a unit to world coordinates (debug/host only). */
        __minionBattlesAdminMoveUnit?: (unitId: string, worldX: number, worldY: number) => void;
        /** Set by DebugUnitsTab when Move mode is active; consumed and cleared by handleCanvasClick. */
        __minionBattlesAdminMovePendingUnitId?: string;
    }
}

type BattleInitPhase = 'fetching_assets' | 'loading_battle' | 'submitting' | 'ready';

interface BattlePhaseProps {
    api: MinionBattlesApi;
    playerId: string;
    isHost: boolean;
    players: Record<string, PlayerState>;
    characterSelections: Record<string, string>;
    missionId: string;
    /** Initial game state from server (if reconnecting). */
    initialGameState?: Record<string, unknown> | null;
    onSidebarInfoChange?: (info: GameSidebarInfo | null) => void;
    /** Called when victory is achieved. Passes mission result from the winning victory check. */
    onVictory?: (missionResult: string) => void;
    /** Called when defeat is achieved (all player units dead). */
    onDefeat?: () => void;
    /** Called when host sends an emitted message (NPC or chat) so the UI can show it immediately. */
    onEmittedChatMessage?: (entry: MessageEntry) => void;
    /** Propagates Minion Battles BattleNet recovery overlay to GameScreen (`GET /heartbeat`-driven resync only). */
    onBattleNetResyncingChange?: (resyncing: boolean) => void;
}

export default function BattlePhase({
    api,
    playerId,
    isHost,
    players,
    characterSelections,
    missionId,
    initialGameState,
    onSidebarInfoChange,
    onVictory,
    onDefeat,
    onEmittedChatMessage,
    onBattleNetResyncingChange,
}: BattlePhaseProps) {
    const canSubmitOrders = true;

    const sessionRef = useRef<BattleSession | null>(null);
    const netRef = useRef<BattleNet | null>(null);
    const prevLobbyHostPlayerIdRef = useRef<string | null>(null);
    const initialHeartbeatCheckedRef = useRef(false);

    // UI state
    const [roundNumber, setRoundNumber] = useState(1);
    const [roundProgress, setRoundProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [waitingForOrders, setWaitingForOrders] = useState<WaitingForOrders | null>(null);
    /** Local player's current unit in a parallel batch (next unit still needing an order). */
    const [activeLocalWaiter, setActiveLocalWaiter] = useState<OrderWaiter | null>(null);
    const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
    const [selectedAbility, setSelectedAbility] = useState<AbilityStatic | null>(null);
    const [isWaitHovered, setIsWaitHovered] = useState(false);
    const [currentTargets, setCurrentTargets] = useState<ResolvedTarget[]>([]);
    /**
     * Named targets keyed by `SelectTargetDef.label` for new-style abilities.
     * Populated in parallel with `currentTargets` during the target-collection loop.
     * Passed to BattleOrder.targetsByLabel on submit for engine-side resolution.
     */
    const targetsByLabelRef = useRef<Record<string, ResolvedTarget>>({});
    const [myAbilityIds, setMyAbilityIds] = useState<string[]>([]);
    const mouseWorldRef = useRef({ x: 0, y: 0 });
    const lockOnCacheRef = useRef<{
        targetIdx: number;
        mouseWorldPos: { x: number; y: number };
        candidate: { unitId: string } | null;
    } | null>(null);
    const targetingStateRef = useRef<{
        selectedAbility: AbilityStatic | null;
        currentTargets: ResolvedTarget[];
        mouseWorld: { x: number; y: number };
        waitingForOrders: WaitingForOrders | null;
        /** Caster unit for targeting preview (parallel batch active local unit). */
        previewOrderUnitId: string | null;
    }>({
        selectedAbility: null,
        currentTargets: [],
        mouseWorld: { x: 0, y: 0 },
        waitingForOrders: null,
        previewOrderUnitId: null,
    });
    targetingStateRef.current = {
        selectedAbility,
        currentTargets,
        mouseWorld: mouseWorldRef.current,
        waitingForOrders,
        previewOrderUnitId: activeLocalWaiter?.unitId ?? null,
    };
    const pendingMovePathRef = useRef<{ col: number; row: number }[] | null>(null);
    /** Up to {@link PLAYER_MOVE_WAYPOINT_MAX} queued destinations (shift-right-click chain). */
    const pendingMoveWaypointsRef = useRef<{ col: number; row: number }[]>([]);
    const [, forceRender] = useState(0);
    const [bossHud, setBossHud] = useState<BossHudSlice>(null);
    const [storyPauseActive, setStoryPauseActive] = useState(false);
    const [teamworkBurstKey, setTeamworkBurstKey] = useState(0);
    const [netSyncStatus, setNetSyncStatus] = useState<BattleNetSyncTerminalStatus>('waiting_for_host');
    const [battleInitPhase, setBattleInitPhase] = useState<BattleInitPhase>('fetching_assets');
    const [netSyncDetails, setNetSyncDetails] = useState<string | null>(null);
    const [resyncInformAck, setResyncInformAck] = useState<{ reason: string; token: number } | null>(null);
    const [waitingForHostCatchup, setWaitingForHostCatchup] = useState(false);
    const [hostCatchupHostTick, setHostCatchupHostTick] = useState(0);
    const [hostCatchupTargetTick, setHostCatchupTargetTick] = useState<number | null>(null);
    const [hostCatchupStuckHeartbeats, setHostCatchupStuckHeartbeats] = useState(0);
    const [fallingBehindHost, setFallingBehindHost] = useState(false);
    const [ticksBehindHost, setTicksBehindHost] = useState(0);
    const [hostAnchorWaitPhase, setHostAnchorWaitPhase] = useState<'idle' | 'waiting_ui' | 'forcing_resync'>('idle');
    const [hostAnchorWaitElapsedMs, setHostAnchorWaitElapsedMs] = useState(0);
    const [waitingForHostPollStreak, setWaitingForHostPollStreak] = useState(0);
    const [blockingHostPausePlane, setBlockingHostPausePlane] = useState(false);
    const [orderPipeline, setOrderPipeline] = useState<{ queued: number; sending: number }>({
        queued: 0,
        sending: 0,
    });
    const [hasReceivedInitialHeartbeat, setHasReceivedInitialHeartbeat] = useState(isHost);

    const battleActionRow = useBattleActionRowHost();

    const dismissResyncInformAck = useCallback(() => setResyncInformAck(null), []);

    const HOST_WAIT_POPOVER_AFTER_HEARTBEATS = BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS;

    const isMyTurn = activeLocalWaiter != null;
    const canUseOrderUi =
        netSyncStatus !== 'synced_pending_ack' &&
        isMyTurn &&
        canSubmitOrders &&
        !storyPauseActive &&
        !waitingForHostCatchup &&
        !blockingHostPausePlane &&
        !sessionRef.current?.isMultiplayerAwaitHostCatchup() &&
        (isHost || !fallingBehindHost);

    const showHostCatchupPopover =
        !isHost &&
        isPaused &&
        waitingForHostCatchup &&
        hostCatchupStuckHeartbeats >= HOST_WAIT_POPOVER_AFTER_HEARTBEATS;

    useEffect(() => {
        onBattleNetResyncingChange?.(netSyncStatus === 'resyncing');
        return () => {
            onBattleNetResyncingChange?.(false);
        };
    }, [netSyncStatus, onBattleNetResyncingChange]);

    useEffect(() => {
        const hostEntry = Object.entries(players).find(([, p]) => p.isHost);
        const nextHostId = hostEntry?.[0] ?? null;
        const prev = prevLobbyHostPlayerIdRef.current;
        if (prev !== null && nextHostId !== null && prev !== nextHostId) {
            const eng = sessionRef.current?.getEngine();
            logToLobbyLog({
                lobbyClient: api.getLobbyClient(),
                lobbyId: api.getLobbyId(),
                playerId,
                tick: eng != null ? eng.gameTick : null,
                severity: 'critical',
                logType: 'debug',
                gameId: api.getGameId(),
                gamePhase: 'battle',
                message:
                    'TODO(host-migration-mid-battle): lobby host player id changed during battle — behaviour undefined',
                context: { previousHostId: prev, nextHostId },
            });
        }
        prevLobbyHostPlayerIdRef.current = nextHostId;
    }, [players, api, playerId]);

    // ========================================================================
    // Debug unit focus/outline bridge (DebugConsole -> Pixi world)
    // ========================================================================
    useEffect(() => {
        window.__minionBattlesDebugSetUnitHover = (unitId: string | null) => {
            sessionRef.current?.getRenderer()?.setDebugUnitOutline(unitId);

            if (!unitId) {
                window.__minionBattlesDebugAutoFollowPausedUntil = Date.now();
                return;
            }

            const engine = sessionRef.current?.getEngine();
            const camera = sessionRef.current?.getCamera();
            if (!engine || !camera) return;
            const unit = engine.getUnit(unitId);
            if (!unit) return;

            camera.snapTo(unit.x, unit.y, unit.radius);
            window.__minionBattlesDebugAutoFollowPausedUntil = Date.now() + 2500;
        };

        window.__minionBattlesAdminHealUnit = (unitId: string) => {
            const engine = sessionRef.current?.getEngine();
            const net = netRef.current;
            if (!engine || !net) return;
            engine.adminHealUnit(unitId);
            void net.debugLogLocalStateAndSubmitSnapshot();
        };

        window.__minionBattlesAdminKillUnit = (unitId: string) => {
            const engine = sessionRef.current?.getEngine();
            const net = netRef.current;
            if (!engine || !net) return;
            engine.adminKillUnit(unitId);
            void net.debugLogLocalStateAndSubmitSnapshot();
        };

        window.__minionBattlesAdminMoveUnit = (unitId: string, worldX: number, worldY: number) => {
            const engine = sessionRef.current?.getEngine();
            const net = netRef.current;
            if (!engine || !net) return;
            engine.adminMoveUnit(unitId, worldX, worldY);
            void net.debugLogLocalStateAndSubmitSnapshot();
        };

        return () => {
            sessionRef.current?.getRenderer()?.setDebugUnitOutline(null);
            window.__minionBattlesDebugSetUnitHover = undefined;
            window.__minionBattlesDebugAutoFollowPausedUntil = undefined;
            window.__minionBattlesDebugGameTick = undefined;
            window.__minionBattlesDebugGameState = undefined;
            window.__minionBattlesAdminHealUnit = undefined;
            window.__minionBattlesAdminKillUnit = undefined;
            window.__minionBattlesAdminMoveUnit = undefined;
            window.__minionBattlesAdminMovePendingUnitId = undefined;
        };

    }, []);

    useEffect(() => {
        let hashSeq = 0;
        const id = window.setInterval(() => {
            const engine = sessionRef.current?.getEngine();
            if (engine) {
                if (typeof engine.gameTick === 'number') {
                    window.__minionBattlesDebugGameTick = engine.gameTick;
                }
                const state = engine.toJSON() as unknown as Record<string, unknown>;
                window.__minionBattlesDebugGameState = state;
                if (window.__minionBattlesDebugTriggerDesyncRequested === true) {
                    sessionRef.current?.triggerDebugDesyncOnce();
                    window.__minionBattlesDebugTriggerDesyncRequested = false;
                }
                const seq = ++hashSeq;
                void computeSynchash(state).then((h: string) => {
                    if (seq === hashSeq) {
                        window.__minionBattlesDebugSynchash = h;
                    }
                });
            }
        }, 100);
        return () => {
            window.clearInterval(id);
            window.__minionBattlesDebugGameTick = undefined;
            window.__minionBattlesDebugGameState = undefined;
            window.__minionBattlesDebugSynchash = undefined;
            window.__minionBattlesDebugTriggerDesyncRequested = undefined;
        };
    }, []);

    useEffect(() => {
        window.__minionBattlesDebugLogLocalStateToLobby = async () => {
            const net = netRef.current;
            if (!net) {
                console.warn('[BattlePhase] debug log local state: BattleNet not ready');
                return;
            }
            try {
                await net.debugLogLocalStateAndSubmitSnapshot();
            } catch (e) {
                console.error('[BattlePhase] debugLogLocalStateAndSubmitSnapshot failed:', e);
            }
        };
        return () => {
            window.__minionBattlesDebugLogLocalStateToLobby = undefined;
        };
    }, []);

    const onSidebarInfoChangeRef = useRef(onSidebarInfoChange);
    onSidebarInfoChangeRef.current = onSidebarInfoChange;
    const playersRef = useRef(players);
    playersRef.current = players;

    useEffect(() => {
        const update = () => {
            const engine = sessionRef.current?.getEngine();
            if (!engine || !onSidebarInfoChangeRef.current) return;

            onSidebarInfoChangeRef.current({
                objectives: engine.getBattleObjectiveRows(),
            });
        };

        update();
        const interval = setInterval(update, 500);
        return () => clearInterval(interval);
    }, [roundNumber]);

    useEffect(() => {
        return () => {
            onSidebarInfoChangeRef.current?.(null);
        };
    }, []);

    const updateCardStateRef = useRef<((engine: GameEngine) => void) | null>(null);

    function updateCardState(engine: GameEngine) {
        const active = engine.state.orderMgr.getActiveOrderWaiterForPlayer(playerId);
        const unit = active ? engine.getUnit(active.unitId) : engine.getLocalPlayerUnit();
        setMyAbilityIds([...(unit?.abilities ?? [])]);
    }
    updateCardStateRef.current = updateCardState;

    const handleWaitingForOrdersState = useCallback(
        (engine: GameEngine, info: WaitingForOrders, _source: 'engine_callback' | 'post_full_state_sync') => {
            setWaitingForOrders(info);
            setIsPaused(true);
            setStoryPauseActive(engine.storyPauseActive);

            if (info.teamworkCancelledOwnerIds?.includes(playerId)) {
                setTeamworkBurstKey((k) => k + 1);
            }

            const active = engine.state.orderMgr.getActiveOrderWaiterForPlayer(playerId);
            setActiveLocalWaiter(active);
            const unit = active ? engine.getUnit(active.unitId) : undefined;
            const existingPath = unit?.pathInvalidated ? undefined : unit?.movement?.path;
            pendingMovePathRef.current = existingPath && existingPath.length > 0
                ? existingPath.map((p) => ({ ...p }))
                : null;
            pendingMoveWaypointsRef.current =
                pendingMovePathRef.current && pendingMovePathRef.current.length > 0
                    ? [{ ...pendingMovePathRef.current[pendingMovePathRef.current.length - 1]! }]
                    : [];

            updateCardStateRef.current?.(engine);
        },
        [playerId],
    );

    useEffect(() => {
        sessionRef.current?.updateLobbyContext(players, characterSelections);
    }, [players, characterSelections]);

    // ========================================================================
    // BattleSession lifecycle (mount load + UI subscription)
    // ========================================================================
    useEffect(() => {
        let effectAlive = true;

        const session = new BattleSession({
            api,
            missionId,
            playerId,
            isHost,
            onVictory,
            onDefeat,
            onEmittedChatMessage,
        });
        sessionRef.current = session;

        const unsub = session.subscribe((ev) => {
            if (ev.type === 'waiting_for_orders') {
                handleWaitingForOrdersState(ev.engine, ev.info, ev.source);
            }
            if (ev.type === 'pause_state') {
                setWaitingForOrders(ev.waitingForOrders);
                setIsPaused(ev.paused);
                const eng = sessionRef.current?.getEngine();
                setActiveLocalWaiter(eng?.state.orderMgr.getActiveOrderWaiterForPlayer(playerId) ?? null);
                setStoryPauseActive(eng?.storyPauseActive ?? false);
            }
            if (ev.type === 'round_number') {
                setRoundNumber(ev.roundNumber);
            }
            if (ev.type === 'round_progress') {
                setRoundProgress(ev.progress);
            }
            if (ev.type === 'card_state') {
                updateCardState(ev.engine);
                setActiveLocalWaiter(ev.engine.state.orderMgr.getActiveOrderWaiterForPlayer(playerId));
                setStoryPauseActive(ev.engine.storyPauseActive);
            }
        });

        const runLoad = async () => {
            session.updateLobbyContext(players, characterSelections);

            const net = createBattleNet({
                api: api.getLobbyClient(),
                session,
                isHost,
                lobbyId: api.getLobbyId(),
                gameId: api.getGameId(),
                playerId,
            });
            netRef.current = net;
            session.setNetAdapter(net);

            /** `BattleNet` exists before async work finishes; React Strict Mode can unmount between awaits. */
            const tearDownNetForAbortedLoad = (): void => {
                net.stop();
                session.setNetAdapter(null);
                if (netRef.current === net) {
                    netRef.current = null;
                }
            };

            const logInit = (message: string, severity: 'info' | 'warn' = 'info') => {
                void logToLobbyLog({
                    lobbyClient: api.getLobbyClient(),
                    lobbyId: api.getLobbyId(),
                    playerId,
                    gameId: api.getGameId(),
                    tick: 0,
                    severity,
                    logType: 'debug',
                    gamePhase: 'battle',
                    message,
                });
            };

            // --- Battle Initialization: fetch terrain assets ---
            setBattleInitPhase('fetching_assets');
            const mission = MISSION_MAP[missionId] ?? DARK_AWAKENING;
            await fetchBattleAssets(api, playerId, mission.segmentIds);

            if (!effectAlive) {
                tearDownNetForAbortedLoad();
                return;
            }

            setBattleInitPhase('loading_battle');
            logInit('Battle Initialization: loading battle engine...');

            let bootstrappedFromCheckpoint = false;
            try {
                bootstrappedFromCheckpoint = await net.tryBootstrapFromLatestCheckpoint();
            } catch (err) {
                console.error('[BattlePhase] tryBootstrapFromLatestCheckpoint failed:', err);
            }

            if (!effectAlive) {
                tearDownNetForAbortedLoad();
                return;
            }

            if (!bootstrappedFromCheckpoint) {
                const battleSeed = typeof initialGameState?.battleSeed === 'number' ? initialGameState.battleSeed : null;
                if (battleSeed == null) {
                    console.error(
                        '[BattlePhase] battleSeed missing from game payload; cannot initialize deterministic battle',
                    );
                    setNetSyncStatus('failed');
                    net.stop();
                    session.setNetAdapter(null);
                    netRef.current = null;
                    return;
                }

                await session.load({
                    players,
                    characterSelections,
                    battleSeed,
                    initialSnapshot: (initialGameState as SerializedGameState | null | undefined) ?? undefined,
                });
            }

            logInit('Battle Initialization: engine loaded');

            if (!effectAlive) {
                tearDownNetForAbortedLoad();
                return;
            }
            const bumpOrderPipeline = () => setOrderPipeline(net.getOrderSyncSummary());
            const unsubs: Array<() => void> = [];
            unsubs.push(
                net.on('sync-status', (status) => {
                    setNetSyncStatus(status);
                    if (status === 'resyncing') {
                        setResyncInformAck(null);
                    }
                    bumpOrderPipeline();
                }),
            );
            unsubs.push(
                net.on('sync-details', (details) => {
                    setNetSyncDetails(details);
                }),
            );
            unsubs.push(
                net.on('post-resync-inform', (payload) => {
                    setResyncInformAck({ reason: payload.reason, token: Date.now() });
                }),
            );
            unsubs.push(
                net.on('host-catchup-wait', (payload) => {
                    setWaitingForHostCatchup(payload.blocking);
                    setHostCatchupHostTick(payload.hostTick);
                    setHostCatchupTargetTick(payload.targetTick);
                    setHostCatchupStuckHeartbeats(payload.stuckHeartbeats);
                    bumpOrderPipeline();
                }),
            );
            unsubs.push(
                net.on('waiting-for-host-poll-streak', (payload) => {
                    setWaitingForHostPollStreak(payload.streak);
                }),
            );
            unsubs.push(
                net.on('falling-behind', (payload) => {
                    setFallingBehindHost(payload.active);
                    setTicksBehindHost(payload.ticksBehind);
                }),
            );
            unsubs.push(
                net.on('host-anchor-wait', (payload) => {
                    setHostAnchorWaitPhase((prev) => (prev === payload.phase ? prev : payload.phase));
                    setHostAnchorWaitElapsedMs(payload.elapsedMs);
                }),
            );
            unsubs.push(
                net.on('blocking-host-pause-plane', (payload) => {
                    setBlockingHostPausePlane((prev) => (prev === payload.blocking ? prev : payload.blocking));
                }),
            );
            unsubs.push(net.on('heartbeat', bumpOrderPipeline));
            unsubs.push(
                net.on('heartbeat', () => {
                    setHasReceivedInitialHeartbeat(true);
                }),
            );
            unsubs.push(net.on('orders-applied', bumpOrderPipeline));
            if (!isHost) {
                unsubs.push(
                    net.on('heartbeat', (heartbeat) => {
                        if (initialHeartbeatCheckedRef.current) return;
                        if (heartbeat.initialFingerprint == null) return;
                        initialHeartbeatCheckedRef.current = true;
                        void session.compareInitialFingerprintWithHeartbeat(heartbeat.initialFingerprint);
                    }),
                );
            }

            const prevCleanup = cleanupRef.current;
            cleanupRef.current = () => {
                for (const unsubNet of unsubs) {
                    unsubNet();
                }
                net.stop();
                session.setNetAdapter(null);
                netRef.current = null;
                prevCleanup();
            };

            if (isHost) {
                setBattleInitPhase('submitting');
                logInit('Battle Initialization: submitting initial state to server...');
                await net.saveInitialState();
            }
            setBattleInitPhase('ready');
            logInit('Battle Initialization: complete');
            session.startEngine();
            net.start();
            bumpOrderPipeline();
        };

        const cleanupRef = {
            current: () => {},
        };
        void runLoad();

        return () => {
            effectAlive = false;
            cleanupRef.current();
            unsub();
            session.destroy();
            sessionRef.current = null;
        };
        // Intentionally mount once: same pattern as previous loadGameState([]).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const tick = () => {
            const eng = sessionRef.current?.getEngine();
            if (!eng) {
                setBossHud(null);
                return;
            }
            const bosses = eng.units.filter((u) => u.isAlive() && u.tags.includes(UnitTag.Boss));
            const b = bosses[0];
            if (!b) {
                setBossHud(null);
                return;
            }
            const exposedBuff = b.buffs.find((buf) => buf._type === 'exposed');
            const exposedSecondsRemaining =
                exposedBuff && exposedBuff.duration.unit === 'seconds'
                    ? Math.max(0, exposedBuff.appliedAtTime + exposedBuff.duration.value - eng.gameTime)
                    : null;
            const exposedTotalDuration =
                exposedBuff?.duration.unit === 'seconds' ? exposedBuff.duration.value : null;
            const next: BossHudSlice = {
                name: b.name,
                hp: b.hp,
                maxHp: b.maxHp,
                effectiveHardCcThreshold: b.getEffectiveHardCcThreshold(),
                hardCcArmourConsumed: b.hardCcArmourConsumed,
                hardCcArmourEventSerial: b.hardCcArmourEventSerial,
                lastHardCcEventKind: b.lastHardCcEventKind,
                specialMoveCharges: getBossSpecialMoveCharges(b),
                exposedSecondsRemaining,
                exposedTotalDuration,
            };
            setBossHud((prev) => {
                const smPrev = prev?.specialMoveCharges;
                const smNext = next.specialMoveCharges;
                const smEqual =
                    (smPrev == null && smNext == null) ||
                    (smPrev != null &&
                        smNext != null &&
                        smPrev.filled === smNext.filled &&
                        smPrev.total === smNext.total &&
                        smPrev.abilityName === smNext.abilityName);

                return prev &&
                    prev.name === next.name &&
                    prev.hp === next.hp &&
                    prev.maxHp === next.maxHp &&
                    prev.effectiveHardCcThreshold === next.effectiveHardCcThreshold &&
                    prev.hardCcArmourConsumed === next.hardCcArmourConsumed &&
                    prev.hardCcArmourEventSerial === next.hardCcArmourEventSerial &&
                    prev.lastHardCcEventKind === next.lastHardCcEventKind &&
                    Math.round((prev.exposedSecondsRemaining ?? -1) * 10) ===
                        Math.round((next.exposedSecondsRemaining ?? -1) * 10) &&
                    prev.exposedTotalDuration === next.exposedTotalDuration &&
                    smEqual
                    ? prev
                    : next;
            });
        };
        tick();
        const id = window.setInterval(tick, 100);
        return () => window.clearInterval(id);
    }, []);

    const handleSelectCard = useCallback((handIndex: number, ability: AbilityStatic) => {
        if (!canUseOrderUi) {
            return;
        }
        if (selectedCardIndex === handIndex) {
            setSelectedCardIndex(null);
            setSelectedAbility(null);
            setCurrentTargets([]);
            targetsByLabelRef.current = {};
            return;
        }

        setSelectedCardIndex(handIndex);
        setSelectedAbility(ability);
        setCurrentTargets([]);
        targetsByLabelRef.current = {};
    }, [selectedCardIndex, canUseOrderUi]);

    const submitOrder = useCallback((
        abilityId: string,
        targets: ResolvedTarget[],
        targetsByLabel?: Record<string, ResolvedTarget>,
    ) => {
        if (!waitingForOrders || !activeLocalWaiter || !canUseOrderUi) return;

        const movePath = pendingMovePathRef.current;

        const order: BattleOrder = {
            unitId: activeLocalWaiter.unitId,
            abilityId,
            targets,
            movePath: movePath ?? undefined,
            ...(targetsByLabel && Object.keys(targetsByLabel).length > 0 ? { targetsByLabel } : {}),
        };

        targetingStateRef.current.selectedAbility = null;
        targetingStateRef.current.currentTargets = [];
        targetingStateRef.current.waitingForOrders = null;
        targetsByLabelRef.current = {};
        pendingMovePathRef.current = null;
        pendingMoveWaypointsRef.current = [];

        void sessionRef.current?.submitPlayerOrder(order, { canSubmitOrders: canUseOrderUi });
    }, [waitingForOrders, activeLocalWaiter, canUseOrderUi]);

    const handleCanvasClick = useCallback((screenX: number, screenY: number) => {
        const adminMovePendingUnitId = window.__minionBattlesAdminMovePendingUnitId;
        if (adminMovePendingUnitId) {
            window.__minionBattlesAdminMovePendingUnitId = undefined;
            const adminEngine = sessionRef.current?.getEngine();
            const adminCamera = sessionRef.current?.getCamera();
            if (adminEngine && adminCamera) {
                const worldPos = adminCamera.screenToWorld(screenX, screenY);
                window.__minionBattlesAdminMoveUnit?.(adminMovePendingUnitId, worldPos.x, worldPos.y);
            }
            return;
        }

        const engine = sessionRef.current?.getEngine();
        const camera = sessionRef.current?.getCamera();
        if (!engine || !camera || !selectedAbility || !canUseOrderUi || !activeLocalWaiter) return;

        const clickResult = resolveClick(screenX, screenY, camera, engine.units);
        const targetIndex = currentTargets.length;
        const caster = engine.getUnit(activeLocalWaiter.unitId);

        // --- New-style: per-timing SelectTargetDef ---
        const selectTargetDefs = getSelectTargetDefsFromTimings(selectedAbility);
        if (selectTargetDefs.length > 0) {
            const selectDef = selectTargetDefs[targetIndex];
            if (!selectDef) return;

            let resolved: ResolvedTarget | null;
            const cache = lockOnCacheRef.current;
            const candidate = cache?.targetIdx === targetIndex ? cache.candidate : null;

            if (candidate) {
                resolved = { type: 'unit', unitId: candidate.unitId };
            } else if (selectDef.allowMiss !== false) {
                resolved = { type: 'pixel', position: clickResult.worldPosition };
            } else {
                return;
            }

            const newTargets = [...currentTargets, resolved];
            const newTargetsByLabel = { ...targetsByLabelRef.current, [selectDef.label]: resolved };
            targetsByLabelRef.current = newTargetsByLabel;
            setCurrentTargets(newTargets);

            if (newTargets.length >= selectTargetDefs.length) {
                submitOrder(selectedAbility.id, newTargets, newTargetsByLabel);
                setSelectedCardIndex(null);
                setSelectedAbility(null);
                setCurrentTargets([]);
                targetsByLabelRef.current = {};
            }
            return;
        }

        // --- Legacy: ability-level targets[] ---
        const resolvedTargets = getAbilityTargets(selectedAbility, caster, engine);
        const targetDef = resolvedTargets[targetIndex];
        if (!targetDef) return;

        let resolved: ResolvedTarget | null;

        if (targetDef.lockOn) {
            const cache = lockOnCacheRef.current;
            const candidate = cache?.targetIdx === targetIndex ? cache.candidate : null;
            if (candidate) {
                resolved = { type: 'unit', unitId: candidate.unitId };
            } else if (targetDef.lockOn.allowMiss !== false) {
                // allowMiss defaults to true — fall back to pixel
                resolved = { type: 'pixel', position: clickResult.worldPosition };
            } else {
                // allowMiss: false with no candidate — block the click
                return;
            }
        } else {
            resolved = validateAndResolveTarget(targetDef, clickResult);
            if (!resolved) return;
        }

        const newTargets = [...currentTargets, resolved];
        setCurrentTargets(newTargets);

        if (newTargets.length >= resolvedTargets.length) {
            submitOrder(selectedAbility.id, newTargets);
            setSelectedCardIndex(null);
            setSelectedAbility(null);
            setCurrentTargets([]);
        }
    }, [selectedAbility, currentTargets, canUseOrderUi, activeLocalWaiter, submitOrder]);

    const handleCanvasMouseMove = useCallback((screenX: number, screenY: number) => {
        const engine = sessionRef.current?.getEngine();
        const camera = sessionRef.current?.getCamera();
        if (camera) {
            const worldPos = camera.screenToWorld(screenX, screenY);
            mouseWorldRef.current = worldPos;

            // Lock-on hover caching: recompute when mouse moves > 2px from cached position
            if (selectedAbility && engine) {
                const state = targetingStateRef.current;
                const targetIndex = state.currentTargets.length;

                // New-style: check per-timing SelectTargetDef first
                const selectTargetDefs = getSelectTargetDefsFromTimings(selectedAbility);
                if (selectTargetDefs.length > 0) {
                    const selectDef = selectTargetDefs[targetIndex];
                    if (selectDef) {
                        const cache = lockOnCacheRef.current;
                        const cacheStale =
                            !cache ||
                            cache.targetIdx !== targetIndex ||
                            Math.sqrt((worldPos.x - cache.mouseWorldPos.x) ** 2 + (worldPos.y - cache.mouseWorldPos.y) ** 2) > 2;
                        if (cacheStale) {
                            const caster = state.previewOrderUnitId ? engine.getUnit(state.previewOrderUnitId) : null;
                            if (caster) {
                                const hitUnits = selectDef.hitbox.resolveTargets(caster, worldPos, engine.units);
                                hitUnits.sort((a, b) => {
                                    const da = (a.x - worldPos.x) ** 2 + (a.y - worldPos.y) ** 2;
                                    const db = (b.x - worldPos.x) ** 2 + (b.y - worldPos.y) ** 2;
                                    return da - db;
                                });
                                lockOnCacheRef.current = {
                                    targetIdx: targetIndex,
                                    mouseWorldPos: { x: worldPos.x, y: worldPos.y },
                                    candidate: hitUnits[0] ? { unitId: hitUnits[0].id } : null,
                                };
                            } else {
                                lockOnCacheRef.current = null;
                            }
                        }
                    } else {
                        lockOnCacheRef.current = null;
                    }
                } else {
                    // Legacy: ability-level targets[] with lockOn
                    const resolvedTargets = getAbilityTargets(selectedAbility, engine.getUnit(state.previewOrderUnitId ?? '') ?? undefined, engine);
                    const targetDef = resolvedTargets[targetIndex];
                    if (targetDef?.lockOn) {
                        const cache = lockOnCacheRef.current;
                        const cacheStale =
                            !cache ||
                            cache.targetIdx !== targetIndex ||
                            Math.sqrt((worldPos.x - cache.mouseWorldPos.x) ** 2 + (worldPos.y - cache.mouseWorldPos.y) ** 2) > 2;
                        if (cacheStale) {
                            const caster = state.previewOrderUnitId ? engine.getUnit(state.previewOrderUnitId) : null;
                            if (caster) {
                                const hitUnits = resolveHitbox(targetDef.lockOn.hitbox, {
                                    engine: engine as unknown as import('../../hitboxes/Hitbox').HitboxEngineContext,
                                    caster,
                                    originX: caster.x,
                                    originY: caster.y,
                                    aimX: worldPos.x,
                                    aimY: worldPos.y,
                                });
                                hitUnits.sort((a, b) => {
                                    const da = (a.x - worldPos.x) ** 2 + (a.y - worldPos.y) ** 2;
                                    const db = (b.x - worldPos.x) ** 2 + (b.y - worldPos.y) ** 2;
                                    return da - db;
                                });
                                lockOnCacheRef.current = {
                                    targetIdx: targetIndex,
                                    mouseWorldPos: { x: worldPos.x, y: worldPos.y },
                                    candidate: hitUnits[0] ? { unitId: hitUnits[0].id } : null,
                                };
                            } else {
                                lockOnCacheRef.current = null;
                            }
                        }
                    } else {
                        lockOnCacheRef.current = null;
                    }
                }
            }

            if (engine?.terrainManager) {
                const grid = engine.terrainManager.grid;
                const worldWidth = engine.getWorldWidth();
                const worldHeight = engine.getWorldHeight();
                const clampedX = Math.max(0, Math.min(worldPos.x, worldWidth));
                const clampedY = Math.max(0, Math.min(worldPos.y, worldHeight));
                const { col, row } = grid.worldToGrid(clampedX, clampedY);
                const terrain = engine.terrainManager.getTerrainAt(clampedX, clampedY);
                const terrainName = TERRAIN_PROPERTIES[terrain]?.name ?? String(terrain);

                let lightLevel: number | null = null;
                if (engine.lightLevelEnabled) {
                    const lightGrid = getLightGrid(
                        engine.globalLightLevel,
                        grid.width,
                        grid.height,
                        engine.getAllLightSources(),
                    );
                    lightLevel = lightGrid[row]?.[col] ?? null;
                }

                window.__minionBattlesDebugMouse = {
                    worldX: clampedX,
                    worldY: clampedY,
                    row,
                    col,
                    terrainName,
                    lightLevel,
                };
            }
        }
        forceRender((n) => n + 1);
    }, [selectedAbility]);

    const handleWait = useCallback(() => {
        const engine = sessionRef.current?.getEngine();
        if (!engine || !canUseOrderUi || !activeLocalWaiter || !waitingForOrders) return;

        submitOrder('wait', []);
        setSelectedCardIndex(null);
        setSelectedAbility(null);
        setCurrentTargets([]);
    }, [canUseOrderUi, activeLocalWaiter, waitingForOrders, submitOrder]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space' && !e.repeat) {
                e.preventDefault();
                handleWait();
                return;
            }
            if (e.code === 'Escape') {
                setSelectedCardIndex(null);
                setSelectedAbility(null);
                setCurrentTargets([]);
                targetsByLabelRef.current = {};
                return;
            }
            const digit = e.key >= '1' && e.key <= '9' ? parseInt(e.key, 10) : 0;
            if (digit > 0 && canUseOrderUi) {
                const index = digit - 1;
                if (index < myAbilityIds.length) {
                    const abilityId = myAbilityIds[index];
                    const ability = abilityId ? getAbility(abilityId) : null;
                    if (ability) {
                        e.preventDefault();
                        handleSelectCard(index, ability);
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleWait, handleSelectCard, myAbilityIds, canUseOrderUi]);

    const handleCanvasRightClick = useCallback((screenX: number, screenY: number, shiftKey: boolean) => {
        const engine = sessionRef.current?.getEngine();
        const camera = sessionRef.current?.getCamera();
        if (!engine || !camera || !canUseOrderUi || !activeLocalWaiter || !waitingForOrders) return;
        if (!engine.terrainManager) return;

        const grid = engine.terrainManager.grid;
        const worldPos = camera.screenToWorld(screenX, screenY);
        const worldWidth = engine.getWorldWidth();
        const worldHeight = engine.getWorldHeight();
        const clampedX = Math.max(0, Math.min(worldPos.x, worldWidth));
        const clampedY = Math.max(0, Math.min(worldPos.y, worldHeight));

        const unit = engine.getUnit(activeLocalWaiter.unitId);
        if (!unit) return;

        const unitGrid = grid.worldToGrid(unit.x, unit.y);
        const destGrid = grid.worldToGrid(clampedX, clampedY);

        if (shiftKey) {
            if (pendingMoveWaypointsRef.current.length >= PLAYER_MOVE_WAYPOINT_MAX) return;
            const nextWaypoints = [...pendingMoveWaypointsRef.current, { ...destGrid }];
            const fullPath = buildPlayerMovePathThroughWaypoints(
                engine.terrainManager,
                unitGrid.col,
                unitGrid.row,
                nextWaypoints,
            );
            if (fullPath === null) return;
            pendingMoveWaypointsRef.current = nextWaypoints;
            pendingMovePathRef.current = fullPath;
            unit.setMovement(fullPath, undefined, engine.gameTick);
            return;
        }

        const waypoints = [{ ...destGrid }];
        const fullPath = buildPlayerMovePathThroughWaypoints(
            engine.terrainManager,
            unitGrid.col,
            unitGrid.row,
            waypoints,
        );
        if (fullPath === null) return;

        pendingMoveWaypointsRef.current = waypoints;
        pendingMovePathRef.current = fullPath;
        unit.setMovement(fullPath, undefined, engine.gameTick);
    }, [canUseOrderUi, activeLocalWaiter, waitingForOrders]);

    const handleForceResync = useCallback(() => {
        netRef.current?.requestResync('manual-force-resync');
    }, []);

    const engine = sessionRef.current?.getEngine() ?? null;
    const renderer = sessionRef.current?.getRenderer() ?? null;
    const camera = sessionRef.current?.getCamera() ?? null;

    if (!isHost && !hasReceivedInitialHeartbeat) {
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm text-light-300">You must gather your party before venturing forth.</p>
                </div>
            </div>
        );
    }

    if (!engine || !renderer || !camera || battleInitPhase !== 'ready') {
        const loadingLabel =
            battleInitPhase === 'fetching_assets'
                ? 'Loading terrain...'
                : battleInitPhase === 'loading_battle'
                  ? 'Initializing battle...'
                  : battleInitPhase === 'submitting'
                    ? 'Preparing battle...'
                    : null;
        return (
            <div className="w-full h-full flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-16 h-16 mx-auto border-4 border-primary border-t-transparent rounded-full animate-spin" />
                    {loadingLabel && <p className="text-sm text-light-300">{loadingLabel}</p>}
                </div>
            </div>
        );
    }

    const actionRowHost = battleActionRow?.actionRowHost ?? null;

    const cardHand = (
        <CardHand
            abilityIds={myAbilityIds}
            playerUnit={
                (activeLocalWaiter != null
                    ? engine.getUnit(activeLocalWaiter.unitId) ?? engine.getLocalPlayerUnit()
                    : engine.getLocalPlayerUnit()) ?? null
            }
            isMyTurn={canUseOrderUi}
            roundNumber={roundNumber}
            roundProgress={roundProgress}
            isPaused={isPaused}
            selectedCardIndex={selectedCardIndex}
            onSelectCard={handleSelectCard}
            onWait={handleWait}
            onWaitHoverChange={setIsWaitHovered}
            gameState={engine}
        />
    );

    return (
        <div className="w-full h-full flex min-h-0 flex-col relative">
            {/* Timeline rail + canvas stack share space above the hand; hand spans full width */}
            <div className="flex min-h-0 flex-1 flex-row">
                <aside
                    className="flex w-80 shrink-0 min-h-0 flex-col overflow-x-hidden border-r border-dark-700"
                    aria-label="Action timeline"
                >
                    <BattleTimeline
                        engine={engine}
                        players={players}
                        localPlayerId={playerId}
                        layout="rail"
                        previewAbility={canUseOrderUi ? (selectedAbility ?? WaitAbility) : null}
                        previewOrderUnitId={activeLocalWaiter?.unitId ?? null}
                    />
                </aside>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div className="relative flex min-h-0 flex-1 flex-col">
                        <BossFightHud boss={bossHud} />
                        <BattleSyncStatus
                            variant="battle"
                            isHost={isHost}
                            isPaused={isPaused}
                            syncStatus={netSyncStatus}
                            syncDetails={netSyncDetails}
                            fallingBehindHost={fallingBehindHost}
                            ticksBehindHost={ticksBehindHost}
                            waitingForHostPollStreak={waitingForHostPollStreak}
                            stuckHeartbeats={hostCatchupStuckHeartbeats}
                            deferredOrderCount={orderPipeline.queued}
                            queuedOrders={orderPipeline.queued}
                            sendingOrders={orderPipeline.sending}
                            hostAnchorWaitElapsedMs={hostAnchorWaitElapsedMs}
                            onRequestBattleReload={() =>
                                netRef.current?.requestResync('user-reload-from-sync-box')
                            }
                            onAcknowledgeRecoveryContinue={() => netRef.current?.acknowledgeRecoveryContinue()}
                            resyncInformAck={resyncInformAck}
                            onDismissResyncInformAck={dismissResyncInformAck}
                        />
                        <BattleCanvas
                            engine={engine}
                            camera={camera}
                            renderer={renderer}
                            targetingStateRef={targetingStateRef}
                            onCanvasClick={handleCanvasClick}
                            onCanvasRightClick={handleCanvasRightClick}
                            onCanvasMouseMove={handleCanvasMouseMove}
                        />
                        <ObjectiveMarkerOverlay
                            engine={engine}
                            camera={camera}
                            battleObjectives={MISSION_MAP[missionId]?.battleObjectives ?? []}
                        />
                        {!isHost && <BattleHostAnchorBanner phase={hostAnchorWaitPhase} />}
                    </div>

                    <TurnIndicator
                        state={
                            !waitingForOrders
                                ? 'playing'
                                : storyPauseActive
                                  ? 'playing'
                                  : canUseOrderUi
                                    ? 'your_turn'
                                    : waitingForOrders.waiters.some((w) => w.ownerId !== playerId)
                                      ? 'ally_turn'
                                      : 'playing'
                        }
                        allyName={
                            waitingForOrders &&
                            waitingForOrders.waiters.some((w) => w.ownerId !== playerId)
                                ? players[
                                      waitingForOrders.waiters.find((w) => w.ownerId !== playerId)!
                                          .ownerId
                                  ]?.name ?? 'Player'
                                : undefined
                        }
                        teamworkBurstKey={teamworkBurstKey}
                        hostCatchupPopover={
                            showHostCatchupPopover
                                ? {
                                      hostTick: hostCatchupHostTick,
                                      targetTick: hostCatchupTargetTick,
                                      stuckHeartbeats: hostCatchupStuckHeartbeats,
                                      onForceResync: handleForceResync,
                                  }
                                : null
                        }
                        orderPipeline={orderPipeline}
                    />
                </div>
            </div>

            {actionRowHost ? (
                createPortal(<div className="min-w-0">{cardHand}</div>, actionRowHost)
            ) : (
                <div className="shrink-0 min-w-0">{cardHand}</div>
            )}
        </div>
    );
}
