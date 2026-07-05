/**
 * BattlePhase - Main battle phase component.
 *
 * Orchestrates BattleSession (engine / camera / renderer), PixiJS canvas, card hand,
 * round tracking, targeting flow, order submission, and server sync.
 */

import React, { useEffect, useRef, useState, useCallback, useContext } from 'react';
import { useCurrentUser } from '../../../../user/useCurrentUser';
import { createPortal } from 'react-dom';
import type { PlayerState, GameSidebarInfo } from '../../../../types';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import type { GameEngine } from '../../game/GameEngine';
import type { SerializedGameState } from '../../game/types';
import type { OrderWaiter, WaitingForOrders, BattleOrder, GhostPlanData } from '../../game/types';
import {
    GHOST_PLAN_SEQUENTIAL_TARGETING_REBROADCAST_MS,
    isFreshSequentialTargetingSentinel,
} from '../../game/types';
import { GhostPlanContext } from '../../../../contexts/GhostPlanContext';
import { BattleSession } from '../../game/BattleSession';
import {
    createBattleNet,
    type BattleNet,
    type BattleNetSyncTerminalStatus,
    BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS,
} from '../../game/battlenet';
import type { AbilityStatic } from '../../abilities/Ability';
import BattleCanvas from '../components/BattleCanvas';
import ObjectiveMarkerOverlay from '../components/ObjectiveMarkerOverlay';
import AbilityBar from '../components/AbilityBar';
import TurnIndicator from '../components/TurnIndicator';
import BattleTimeline from '../components/BattleTimeline';
import { WaitAbility } from '../../abilities/WaitAbility';
import BattleSyncStatus from '../components/BattleSyncStatus';
import BattleHostAnchorBanner from '../components/BattleHostAnchorBanner';
import BossFightHud from '../components/boss/BossFightHud';
import type { BossHudSlice } from '../components/boss/BossFightHud';
import WorldModifiersPanel from '../components/WorldModifiersPanel';
import type { WorldModifierDef } from '../../worldModifiers/types';
import type { NinjutsuUIState } from '../../game/ninjutsu/NinjutsuManager';
import { getBossSpecialMoveCharges } from '../components/boss/bossSignatureHud';
import { UnitTag } from '../../game/units/unitTag';
import { getEffectiveHardCcThreshold } from '../../crowdControl/ccArmourState';
import type { MessageEntry } from '../../../../components/Chat';
import { TeamworkTextEffect, RewindingTextEffect } from '../../game/effect_defs/hudEffects';
import { computeSynchash } from '@/utils/synchash';
import { logToLobbyLog } from '../../../../lobbyLog';
import { useBattleActionRowHost } from '../../../../contexts/BattleActionRowContext';
import { useDebugConsole, type BattleDebugBridge, type BattleDebugSnapshot } from '../../../../contexts/DebugConsoleContext';
import HudEffectCanvas, { type HudEffectCanvasHandle } from '../components/HudEffectCanvas';
import { fetchBattleAssets } from '../../game/fetchBattleAssets';
import { MISSION_MAP, DARK_AWAKENING } from '../../storylines';
import { AUTO_END_TURN } from '../../game/gameConstants';
import { getAbility } from '../../abilities/AbilityRegistry';
import {
    resolveClick,
    getSelectTargetDefsFromTimings,
    buildMeleeSelectOrderTargets,
    clampSelectTarget,
    resolveSelectTargetLockOnCandidates,
} from '../../abilities/targeting';
import { buildPlayerMovePathThroughWaypoints } from '../../terrain/playerMovePath';
import { Play, Pause, Square } from 'lucide-react';

declare global {
    interface Window {
        /**
         * When > Date.now(), BattleCanvas pauses auto-follow centering to give debug camera focus time.
         * Internal between BattlePhase and BattleCanvas — not part of the debug bridge.
         */
        __minionBattlesDebugAutoFollowPausedUntil?: number;
    }
}

type BattleInitPhase = 'fetching_assets' | 'loading_battle' | 'submitting' | 'ready';

/** DOM rewind overlay fade duration (rollback restore under a frozen frame). */
const REWIND_OVERLAY_FADE_MS = 500;

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
    const { isAdmin } = useCurrentUser();
    const canSubmitOrders = true;

    const { setBattleBridge, adminMovePendingUnitId, setAdminMovePendingUnitId } = useDebugConsole();

    const sessionRef = useRef<BattleSession | null>(null);
    const netRef = useRef<BattleNet | null>(null);
    const hudEffectCanvasRef = useRef<HudEffectCanvasHandle | null>(null);
    const prevLobbyHostPlayerIdRef = useRef<string | null>(null);
    const initialHeartbeatCheckedRef = useRef(false);

    // Snapshot ref for the debug bridge — written by the 100ms polling interval.
    const snapshotRef = useRef<BattleDebugSnapshot>({ gameTick: null, gameState: null, synchash: null });
    // Mirror of adminMovePendingUnitId from context — readable inside setInterval closures.
    const adminMovePendingRef = useRef<string | null>(null);
    adminMovePendingRef.current = adminMovePendingUnitId;

    // UI state
    const [roundNumber, setRoundNumber] = useState(1);
    const [roundProgress, setRoundProgress] = useState(0);
    const [isPaused, setIsPaused] = useState(false);
    const [waitingForOrders, setWaitingForOrders] = useState<WaitingForOrders | null>(null);
    /** Local player's current unit in a parallel batch (next unit still needing an order). */
    const [activeLocalWaiter, setActiveLocalWaiter] = useState<OrderWaiter | null>(null);
    const [_isWaitHovered, setIsWaitHovered] = useState(false);
    const [myAbilityIds, setMyAbilityIds] = useState<string[]>([]);
    /** Mirror of manager UI state for AbilityBar rendering. */
    const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);
    const [selectedAbility, setSelectedAbility] = useState<AbilityStatic | null>(null);
    const [nonconfirmedOrder, setNonconfirmedOrder] = useState<BattleOrder | null>(null);
    /** Per-ability cast mode (push/pull) — persists for the battle; written into submitted orders. */
    const [abilityModeByAbilityId, setAbilityModeByAbilityId] = useState<Record<string, string>>({});
    const abilityModeByAbilityIdRef = useRef<Record<string, string>>({});
    abilityModeByAbilityIdRef.current = abilityModeByAbilityId;
    /** Playahead state while InteractiveTargetingSession is active. */
    const [interactiveTargetingState, setInteractiveTargetingState] = useState<'inactive' | 'playing' | 'paused' | 'done'>('inactive');
    /** True when every frozen SelectTargetDef label has a collected target (final input received). */
    const [interactiveAllTargetsCollected, setInteractiveAllTargetsCollected] = useState(false);
    const { ghostPlans, sendGhostPlan } = useContext(GhostPlanContext);

    const targetingStateRef = useRef<{
        selectedAbility: AbilityStatic | null;
        currentTargets: readonly { type: string; unitId?: string; position?: { x: number; y: number } }[];
        mouseWorld: { x: number; y: number };
        waitingForOrders: WaitingForOrders | null;
        /** Caster unit for targeting preview (parallel batch active local unit). */
        previewOrderUnitId: string | null;
        ghostPlans?: Record<string, GhostPlanData>;
        /** Nonconfirmed order (submitted to engine without endTurn: true). Used for stable ghost plan broadcast. */
        nonconfirmedOrder: BattleOrder | null;
    }>({
        selectedAbility: null,
        currentTargets: [],
        mouseWorld: { x: 0, y: 0 },
        waitingForOrders: null,
        previewOrderUnitId: null,
        nonconfirmedOrder: null,
    });
    // Assign targetingStateRef in the component body so it's always current before each render.
    // BattleCanvas reads targetingStateRef.current.selectedAbility to suppress drag-to-pan.
    {
        const manager = sessionRef.current?.getInteractionManager();
        const uiState = manager?.getUIState();
        const its = sessionRef.current?.interactiveTargeting;
        const itsActive = its?.isActive ?? false;
        const itsAbilityId = itsActive && its ? its.abilityId : null;
        const itsUnitId = itsActive && its ? its.unitId : null;
        const itsAbility = itsAbilityId ? getAbility(itsAbilityId) : null;
        // Only show the targeting cursor when the engine is actually paused waiting for an input.
        const itsWaitingForTarget = itsActive
            ? (sessionRef.current?.getEngine()?.waitingForTargetInput ?? null)
            : null;
        const itsShowCursor = itsActive && itsWaitingForTarget !== null;
        const itsCurrentTargets = itsShowCursor && its
            ? Object.values(its.collectedTargets)
            : null;
        targetingStateRef.current = {
            selectedAbility: itsShowCursor && itsAbility ? itsAbility : (uiState?.selectedAbility ?? null),
            currentTargets: itsShowCursor && itsCurrentTargets !== null
                ? itsCurrentTargets
                : (uiState?.currentTargets ?? []),
            mouseWorld: uiState?.mouseWorld ?? { x: 0, y: 0 },
            waitingForOrders,
            previewOrderUnitId: itsActive && itsUnitId ? itsUnitId : (uiState?.previewOrderUnitId ?? activeLocalWaiter?.unitId ?? null),
            ghostPlans: Object.fromEntries(
                Object.entries(ghostPlans).filter(([, v]) => v !== null)
            ) as Record<string, GhostPlanData>,
            nonconfirmedOrder: uiState?.nonconfirmedOrder ?? null,
        };
    }
const [bossHud, setBossHud] = useState<BossHudSlice>(null);
    const [activeWorldModifiers, setActiveWorldModifiers] = useState<WorldModifierDef[]>([]);
    const [ninjutsuPools, setNinjutsuPools] = useState<NinjutsuUIState[] | null>(null);
    const [storyPauseActive, setStoryPauseActive] = useState(false);
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
    /** Set when commit() detects a silent-drop from BattleNet; shown as a dismissible banner. */
    const [orderSubmitFailed, setOrderSubmitFailed] = useState(false);
    /** Frozen-frame overlay while sequential targeting rolls back (DOM, not Pixi). */
    const [rewindOverlay, setRewindOverlay] = useState<{ frameUrl: string; token: number } | null>(null);
    const [rewindOverlayOpaque, setRewindOverlayOpaque] = useState(true);
    const rewindFadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rewindFadeRafRef = useRef<number | null>(null);

    const battleActionRow = useBattleActionRowHost();

    const dismissResyncInformAck = useCallback(() => setResyncInformAck(null), []);

    const lastSentGhostPlanRef = useRef<GhostPlanData | null>(null);
    const lastSentSequentialTargetingMsRef = useRef(0);
    /** First observation time for legacy sentinels missing sentAtMs (one grace period). */
    const sequentialTargetingFirstSeenRef = useRef<Record<string, number>>({});
    const [ghostPlanFreshnessClock, setGhostPlanFreshnessClock] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => {
            setGhostPlanFreshnessClock(Date.now());
            const its = sessionRef.current?.interactiveTargeting;
            if (its?.isActive) {
                // Broadcast a "sequential targeting" signal so other players know not to submit
                // their own orders yet. The preview animation is local-only, so we send a sentinel
                // plan (with sequentialTargeting: true) rather than null, which would clear the signal.
                const nowMs = Date.now();
                if (nowMs - lastSentSequentialTargetingMsRef.current < GHOST_PLAN_SEQUENTIAL_TARGETING_REBROADCAST_MS) {
                    return;
                }
                const signal: GhostPlanData = {
                    unitId: its.unitId ?? '',
                    abilityId: its.abilityId ?? '',
                    currentTargets: [],
                    mouseWorld: { x: 0, y: 0 },
                    sequentialTargeting: true,
                    sentAtMs: nowMs,
                };
                lastSentSequentialTargetingMsRef.current = nowMs;
                lastSentGhostPlanRef.current = signal;
                sendGhostPlan(signal);
                return;
            }
            lastSentSequentialTargetingMsRef.current = 0;
            const manager = sessionRef.current?.getInteractionManager();
            const uiState = manager?.getUIState();
            const newPlan: GhostPlanData | null =
                uiState?.selectedAbility && uiState?.previewOrderUnitId
                    ? {
                          unitId: uiState.previewOrderUnitId,
                          abilityId: uiState.selectedAbility.id,
                          currentTargets: [...uiState.currentTargets],
                          mouseWorld: { ...uiState.mouseWorld },
                      }
                    : uiState?.nonconfirmedOrder
                    ? {
                          unitId: uiState.nonconfirmedOrder.unitId,
                          abilityId: uiState.nonconfirmedOrder.abilityId,
                          currentTargets: uiState.nonconfirmedOrder.targets,
                          mouseWorld: uiState.nonconfirmedOrder.targets[0]?.position ?? { x: 0, y: 0 },
                      }
                    : null;
            const prev = lastSentGhostPlanRef.current;
            const changed =
                newPlan === null
                    ? prev !== null
                    : prev === null ||
                      prev.sequentialTargeting === true ||
                      newPlan.unitId !== prev.unitId ||
                      newPlan.abilityId !== prev.abilityId ||
                      newPlan.mouseWorld.x !== prev.mouseWorld.x ||
                      newPlan.mouseWorld.y !== prev.mouseWorld.y ||
                      newPlan.currentTargets.length !== prev.currentTargets.length;
            if (changed) {
                lastSentGhostPlanRef.current = newPlan;
                sendGhostPlan(newPlan);
            }
        }, 100);
        return () => {
            clearInterval(interval);
            sendGhostPlan(null);
        };
    }, [sendGhostPlan]);

    const HOST_WAIT_POPOVER_AFTER_HEARTBEATS = BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS;

    // True when any other connected player is in sequential targeting preview — block our own order
    // submission until they confirm, since their orders are being held on the host anyway.
    const anotherPlayerIsInSequentialTargeting = Object.entries(ghostPlans).some(
        ([pid, plan]) => {
            if (pid === playerId || plan?.sequentialTargeting !== true) {
                if (plan == null) {
                    delete sequentialTargetingFirstSeenRef.current[pid];
                }
                return false;
            }
            if (plan.sentAtMs == null && sequentialTargetingFirstSeenRef.current[pid] == null) {
                sequentialTargetingFirstSeenRef.current[pid] = ghostPlanFreshnessClock || Date.now();
            }
            if (plan.sentAtMs != null) {
                delete sequentialTargetingFirstSeenRef.current[pid];
            }
            return isFreshSequentialTargetingSentinel(
                plan,
                sequentialTargetingFirstSeenRef.current[pid],
                ghostPlanFreshnessClock || Date.now(),
            );
        },
    );
    const anotherPlayerIsInSequentialTargetingRef = useRef(false);
    anotherPlayerIsInSequentialTargetingRef.current = anotherPlayerIsInSequentialTargeting;

    const isMyTurn = activeLocalWaiter != null;
    const canUseOrderUi =
        netSyncStatus !== 'synced_pending_ack' &&
        isMyTurn &&
        canSubmitOrders &&
        !storyPauseActive &&
        !waitingForHostCatchup &&
        !blockingHostPausePlane &&
        !sessionRef.current?.isMultiplayerAwaitHostCatchup() &&
        (isHost || !fallingBehindHost) &&
        !anotherPlayerIsInSequentialTargeting;

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
    // Debug bridge — registers BattleDebugBridge into DebugConsoleContext.
    // All functions lazily read sessionRef/netRef so the bridge is safe to
    // set up at mount even before the session has initialised.
    // ========================================================================
    useEffect(() => {
        const bridge: BattleDebugBridge = {
            setUnitHover: (unitId) => {
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
            },
            adminHealUnit: (unitId) => {
                const engine = sessionRef.current?.getEngine();
                const net = netRef.current;
                if (!engine || !net) return;
                engine.adminHealUnit(unitId);
                void net.debugLogLocalStateAndSubmitSnapshot();
            },
            adminKillUnit: (unitId) => {
                const engine = sessionRef.current?.getEngine();
                const net = netRef.current;
                if (!engine || !net) return;
                engine.adminKillUnit(unitId);
                void net.debugLogLocalStateAndSubmitSnapshot();
            },
            adminMoveUnit: (unitId, worldX, worldY) => {
                const engine = sessionRef.current?.getEngine();
                const net = netRef.current;
                if (!engine || !net) return;
                engine.adminMoveUnit(unitId, worldX, worldY);
                void net.debugLogLocalStateAndSubmitSnapshot();
            },
            logLocalStateToLobby: async () => {
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
            },
            triggerDesync: () => {
                sessionRef.current?.triggerDebugDesyncOnce();
            },
            triggerReplayFromStart: () => {
                void sessionRef.current?.replayMissionFromStart();
            },
            getSnapshot: () => snapshotRef.current,
            getWorldModifiersDebug: () => {
                const engine = sessionRef.current?.getEngine();
                return engine ? engine.getWorldModifiersDebugSnapshot() : [];
            },
            setWorldModifierDisabled: (modifierId, disabled) => {
                const engine = sessionRef.current?.getEngine();
                const net = netRef.current;
                if (!engine || !net) return;
                engine.state.worldModifierManager.setDisabled(modifierId, disabled);
                void net.debugLogLocalStateAndSubmitSnapshot();
            },
            addTestWorldModifier: () => {
                const engine = sessionRef.current?.getEngine();
                const net = netRef.current;
                if (!engine || !net) return;
                void import('../../worldModifiers/presets').then(({ rainyStormModifier }) => {
                    engine.state.worldModifierManager.addModifier(rainyStormModifier());
                    void net.debugLogLocalStateAndSubmitSnapshot();
                });
            },
        };
        setBattleBridge(bridge);
        return () => {
            sessionRef.current?.getRenderer()?.setDebugUnitOutline(null);
            setBattleBridge(null);
        };
    }, [setBattleBridge]);

    // Populate snapshotRef every 100ms for bridge.getSnapshot() callers.
    // Also detects when AdminMoveDebugTool has consumed the pending unit ID
    // and syncs the cleared state back to context.
    useEffect(() => {
        let hashSeq = 0;
        const id = window.setInterval(() => {
            const engine = sessionRef.current?.getEngine();
            const mgr = sessionRef.current?.getInteractionManager();
            if (engine) {
                const state = engine.toJSON() as unknown as Record<string, unknown>;
                snapshotRef.current = {
                    gameTick: typeof engine.gameTick === 'number' ? engine.gameTick : null,
                    gameState: state,
                    synchash: snapshotRef.current.synchash,
                };
                // Detect when AdminMoveDebugTool has consumed the pending unit id.
                if (adminMovePendingRef.current !== null && (mgr?.adminMovePendingUnitId ?? null) === null) {
                    setAdminMovePendingUnitId(null);
                }
                const seq = ++hashSeq;
                void computeSynchash(state).then((h: string) => {
                    if (seq === hashSeq) {
                        snapshotRef.current = { ...snapshotRef.current, synchash: h };
                    }
                });
            }
        }, 100);
        return () => {
            window.clearInterval(id);
            snapshotRef.current = { gameTick: null, gameState: null, synchash: null };
        };
    }, [setAdminMovePendingUnitId]);

    // Sync adminMovePendingUnitId from context into the interaction manager's field.
    useEffect(() => {
        sessionRef.current?.getInteractionManager()?.setAdminMovePendingUnitId(adminMovePendingUnitId);
    }, [adminMovePendingUnitId]);

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
                hudEffectCanvasRef.current?.addHudEffect(new TeamworkTextEffect());
            }

            const active = engine.state.orderMgr.getActiveOrderWaiterForPlayer(playerId);
            setActiveLocalWaiter(active);

            updateCardStateRef.current?.(engine);
        },
        [playerId],
    );

    useEffect(() => {
        sessionRef.current?.updateLobbyContext(players, characterSelections);
    }, [players, characterSelections]);

    const battleCanvasAreaRef = useRef<HTMLDivElement>(null);

    // Pass the camera instance and initial canvas page offset to HudEffectCanvas once ready.
    useEffect(() => {
        if (battleInitPhase !== 'ready') return;
        const cam = sessionRef.current?.getCamera();
        if (cam) hudEffectCanvasRef.current?.setCamera(cam);
        const el = battleCanvasAreaRef.current;
        if (el) {
            const rect = el.getBoundingClientRect();
            hudEffectCanvasRef.current?.setCanvasPageOffset(rect.left, rect.top);
        }
    }, [battleInitPhase]);

    // Keep canvas page offset current on window resize (reads refs lazily — stable listener).
    useEffect(() => {
        const onResize = () => {
            const el = battleCanvasAreaRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            hudEffectCanvasRef.current?.setCanvasPageOffset(rect.left, rect.top);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

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
            if (ev.type === 'order_submit_failed') {
                setOrderSubmitFailed(true);
            }
            if (ev.type === 'sequential_targeting_rewind') {
                // Capture the last painted frame before restore tears down the engine.
                // Force one render so the WebGL buffer is readable in this turn.
                const eng = session.getEngine();
                const cam = session.getCamera();
                const rend = session.getRenderer();
                if (eng && cam && rend?.isInitialized()) {
                    rend.render(eng, cam, null, 0);
                }
                const canvas = battleCanvasAreaRef.current?.querySelector('canvas');
                let frameUrl = '';
                if (canvas instanceof HTMLCanvasElement) {
                    try {
                        frameUrl = canvas.toDataURL('image/png');
                    } catch {
                        frameUrl = '';
                    }
                }
                if (rewindFadeTimerRef.current != null) {
                    clearTimeout(rewindFadeTimerRef.current);
                    rewindFadeTimerRef.current = null;
                }
                if (rewindFadeRafRef.current != null) {
                    cancelAnimationFrame(rewindFadeRafRef.current);
                    rewindFadeRafRef.current = null;
                }
                // Label lives on HudEffectCanvas (same layer as Round Start / Teamwork),
                // over the TurnIndicator — survives game-renderer teardown.
                hudEffectCanvasRef.current?.addHudEffect(new RewindingTextEffect());
                setRewindOverlay({ frameUrl, token: Date.now() });
                setRewindOverlayOpaque(true);
                // Double-rAF so the opaque overlay paints before the fade starts.
                rewindFadeRafRef.current = requestAnimationFrame(() => {
                    rewindFadeRafRef.current = requestAnimationFrame(() => {
                        rewindFadeRafRef.current = null;
                        setRewindOverlayOpaque(false);
                        rewindFadeTimerRef.current = setTimeout(() => {
                            setRewindOverlay(null);
                            rewindFadeTimerRef.current = null;
                        }, REWIND_OVERLAY_FADE_MS);
                    });
                });
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
            if (rewindFadeTimerRef.current != null) {
                clearTimeout(rewindFadeTimerRef.current);
                rewindFadeTimerRef.current = null;
            }
            if (rewindFadeRafRef.current != null) {
                cancelAnimationFrame(rewindFadeRafRef.current);
                rewindFadeRafRef.current = null;
            }
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
                hpInjury: b.hpInjury,
                effectiveHardCcThreshold: getEffectiveHardCcThreshold(b),
                hardCcArmourConsumed: b.ccArmour.hardConsumed,
                hardCcArmourEventSerial: b.ccArmour.eventSerial,
                lastHardCcEventKind: b.ccArmour.lastEventKind,
                specialMoveCharges: getBossSpecialMoveCharges(b),
                exposedSecondsRemaining,
                exposedTotalDuration,
                isEnraged: b.tags.includes(UnitTag.Enraged),
                characterId: b.characterId,
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
                    prev.hpInjury === next.hpInjury &&
                    prev.effectiveHardCcThreshold === next.effectiveHardCcThreshold &&
                    prev.hardCcArmourConsumed === next.hardCcArmourConsumed &&
                    prev.hardCcArmourEventSerial === next.hardCcArmourEventSerial &&
                    prev.lastHardCcEventKind === next.lastHardCcEventKind &&
                    Math.round((prev.exposedSecondsRemaining ?? -1) * 10) ===
                        Math.round((next.exposedSecondsRemaining ?? -1) * 10) &&
                    prev.exposedTotalDuration === next.exposedTotalDuration &&
                    prev.isEnraged === next.isEnraged &&
                    prev.characterId === next.characterId &&
                    smEqual
                    ? prev
                    : next;
            });
        };
        tick();
        const id = window.setInterval(tick, 100);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        const id = window.setInterval(() => {
            const eng = sessionRef.current?.getEngine();
            setActiveWorldModifiers(eng ? eng.getActiveWorldModifiersForUI() : []);
            setNinjutsuPools(eng ? eng.getNinjutsuPoolState() : null);
        }, 500);
        return () => window.clearInterval(id);
    }, []);

    // Poll interactive targeting session state so the pill + buttons stay current.
    const prevItsStateRef = useRef<string>('inactive');
    const autoCommitItsAttemptedRef = useRef(false);
    useEffect(() => {
        const id = window.setInterval(() => {
            const session = sessionRef.current;
            const its = session?.interactiveTargeting;
            if (!its?.isActive) {
                autoCommitItsAttemptedRef.current = false;
                setInteractiveAllTargetsCollected(false);
                setInteractiveTargetingState('inactive');
                if (prevItsStateRef.current !== 'inactive') {
                    prevItsStateRef.current = 'inactive';
                }
                return;
            }
            const eng = session?.getEngine();
            if (!eng) {
                setInteractiveTargetingState('playing');
                return;
            }
            let nextState: 'playing' | 'paused' | 'done';
            if (eng.waitingForTargetInput) {
                nextState = 'paused';
            } else {
                const abilityDef = its.abilityId ? getAbility(its.abilityId) : null;
                const caster = its.unitId ? eng.getUnit(its.unitId) ?? undefined : undefined;
                const totalDefs = abilityDef && caster
                    ? getSelectTargetDefsFromTimings(abilityDef, caster, eng).length
                    : 0;
                const collected = Object.keys(its.collectedTargets).length;
                // Report 'done' only when all targets are collected AND the preview engine has
                // paused (final-hit animation has played and the Step-5 stop condition fired).
                // This ensures Done/Continue does not appear before the last hit lands visually.
                const allCollected = totalDefs > 0 && collected >= totalDefs;
                nextState = allCollected && eng.isPaused ? 'done' : 'playing';
            }
            setInteractiveAllTargetsCollected(its.allTargetsCollected());
            // AUTO_END_TURN commits as soon as the preview is done (in-place or rewind).
            if (nextState === 'done' && AUTO_END_TURN && !autoCommitItsAttemptedRef.current && session) {
                autoCommitItsAttemptedRef.current = true;
                setOrderSubmitFailed(false);
                void session.interactiveTargeting.commit(session);
            }
            setInteractiveTargetingState(nextState);
            if (prevItsStateRef.current !== nextState) {
                prevItsStateRef.current = nextState;
            }
        }, 50);
        return () => window.clearInterval(id);
    }, [canUseOrderUi, anotherPlayerIsInSequentialTargeting, activeLocalWaiter]);

    // ========================================================================
    // Manager subscription: mirror selectedAbility, selectedCardIndex, nonconfirmedOrder
    // into local React state for AbilityBar rendering.
    // ========================================================================
    useEffect(() => {
        const manager = sessionRef.current?.getInteractionManager();
        if (!manager) return;
        const sync = () => {
            const s = manager.getUIState();
            setSelectedAbility(s.selectedAbility);
            setSelectedCardIndex(s.selectedCardIndex);
            setNonconfirmedOrder(s.nonconfirmedOrder);
        };
        sync();
        return manager.subscribe(sync);
    // Re-subscribe whenever battleInitPhase goes to 'ready' (manager is created in startEngine).
    }, [battleInitPhase]);

    // ========================================================================
    // Push canUseOrderUi, waitingForOrders, and myAbilityIds into the manager.
    // ========================================================================
    useEffect(() => {
        const mgr = sessionRef.current?.getInteractionManager();
        if (!mgr) return;
        mgr.setCanUseOrderUi(canUseOrderUi);
        mgr.setWaitingForOrders(waitingForOrders);
        mgr.setMyAbilityIds(myAbilityIds);
        mgr.setAbilityModeResolver((abilityId) => {
            const stored = abilityModeByAbilityIdRef.current[abilityId];
            if (stored !== undefined) return stored;
            return getAbility(abilityId)?.abilityModes?.defaultMode;
        });
    }, [canUseOrderUi, waitingForOrders, myAbilityIds, battleInitPhase, abilityModeByAbilityId]);

    // ========================================================================
    // Keydown: delegate to manager.onKeyDown.
    // ========================================================================
    useEffect(() => {
        if (battleInitPhase !== 'ready') return;
        const onKeyDown = (e: KeyboardEvent) => {
            sessionRef.current?.getInteractionManager()?.onKeyDown(e);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [battleInitPhase]);

    // ========================================================================
    // Canvas event callbacks — delegate to manager.
    // ========================================================================
    const handleCanvasClick = useCallback((screenX: number, screenY: number) => {
        const session = sessionRef.current;
        const its = session?.interactiveTargeting;
        if (its?.isActive && session) {
            const engine = session.getEngine();
            const camera = session.getCamera();
            const waitingSignal = engine?.waitingForTargetInput;
            if (engine && camera && waitingSignal) {
                const label = waitingSignal.label;
                const caster = engine.getUnit(waitingSignal.unitId);
                const abilityDef = its.abilityId ? getAbility(its.abilityId) : null;
                const clickResult = resolveClick(screenX, screenY, camera, engine.units);
                if (caster && abilityDef) {
                    const selectDefs = getSelectTargetDefsFromTimings(abilityDef, caster, engine);
                    // Find the selectDef for this label.
                    const selectDef = selectDefs.find((d) => d.label === label);
                        if (selectDef) {
                            const mouseWorld = camera.screenToWorld(screenX, screenY);
                            // Must match targeting-preview highlights (post-lunge virtual caster).
                            const candidates = resolveSelectTargetLockOnCandidates(
                                abilityDef,
                                caster,
                                selectDef,
                                mouseWorld,
                                engine,
                            );
                            let resolved = null;
                            if (candidates.length > 0) {
                                resolved = { type: 'unit' as const, unitId: candidates[0]!.id };
                            } else if (selectDef.allowMiss !== false) {
                                resolved = { type: 'pixel' as const, position: clickResult.worldPosition };
                            }
                            if (resolved) {
                                const collectedOrdered = selectDefs
                                    .map((d) => its.collectedTargets[d.label])
                                    .filter((t): t is NonNullable<typeof t> => t != null);
                                resolved = clampSelectTarget(
                                    abilityDef,
                                    caster,
                                    selectDef,
                                    its.collectedTargets,
                                    collectedOrdered,
                                    resolved,
                                    engine,
                                );
                                const numTargets = selectDef.numTargets ?? selectDef.hitbox.numTargets;
                                const lockOnCandidates = candidates.map((u) => ({ unitId: u.id }));
                                its.resolveTarget(
                                    label,
                                    resolved,
                                    session,
                                    buildMeleeSelectOrderTargets(resolved, lockOnCandidates, clickResult.worldPosition, numTargets),
                                );
                            }
                        }
                }
            }
            return;
        }
        session?.getInteractionManager()?.onCanvasClick(screenX, screenY);
    }, []);

    const handleCanvasRightClick = useCallback((screenX: number, screenY: number, shiftKey: boolean, ctrlKey: boolean) => {
        const session = sessionRef.current;
        const its = session?.interactiveTargeting;
        if (its?.isActive && session) {
            // While paused for a SelectTargetDef label, route right-click to movement re-input.
            const engine = session.getEngine();
            const camera = session.getCamera();
            const waitingSignal = engine?.waitingForTargetInput;
            if (engine && camera && waitingSignal && engine.terrainManager) {
                const label = waitingSignal.label;
                const caster = engine.getUnit(waitingSignal.unitId);
                if (caster) {
                    const grid = engine.terrainManager.grid;
                    const worldPos = camera.screenToWorld(screenX, screenY);
                    const clampedX = Math.max(0, Math.min(worldPos.x, engine.getWorldWidth()));
                    const clampedY = Math.max(0, Math.min(worldPos.y, engine.getWorldHeight()));
                    const unitGrid = grid.worldToGrid(caster.x, caster.y);
                    if (ctrlKey) {
                        const destGrid = grid.worldToGrid(clampedX, clampedY);
                        const fullPath = buildPlayerMovePathThroughWaypoints(engine.terrainManager, unitGrid.col, unitGrid.row, [destGrid]);
                        if (fullPath !== null) {
                            its.resolveMovement(label, { movePath: fullPath, moveTargetPixel: { x: clampedX, y: clampedY } }, session);
                        }
                    } else {
                        const destGrid = grid.worldToGrid(clampedX, clampedY);
                        const fullPath = buildPlayerMovePathThroughWaypoints(engine.terrainManager, unitGrid.col, unitGrid.row, [destGrid]);
                        if (fullPath !== null) {
                            its.resolveMovement(label, { movePath: fullPath }, session);
                        }
                    }
                }
            }
            return;
        }
        if (anotherPlayerIsInSequentialTargetingRef.current) return;
        session?.getInteractionManager()?.onCanvasRightClick(screenX, screenY, shiftKey, ctrlKey);
    }, []);

    const handleCanvasMouseMove = useCallback((screenX: number, screenY: number) => {
        const mgr = sessionRef.current?.getInteractionManager();
        mgr?.onCanvasMouseMove(screenX, screenY);
        // Bypass the React render cycle: write the live world position directly into
        // targetingStateRef so the RAF loop always gets the current mouse location.
        const mw = mgr?.getUIState()?.mouseWorld;
        if (mw && targetingStateRef.current) {
            targetingStateRef.current.mouseWorld = mw;
        }
    }, []);

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

    const pausedAbility = activeLocalWaiter != null
        ? engine.getUnit(activeLocalWaiter.unitId)?.activeAbilities.find((a) => a.conditionalCancelPaused)
        : undefined;
    const conditionalCancelContext = pausedAbility != null
        ? { activeAbilityId: pausedAbility.abilityId, abilityTagFilter: pausedAbility.conditionalCancelTagFilter }
        : undefined;

    const handleCycleAbilityMode = (abilityId: string, modes: readonly string[]) => {
        setAbilityModeByAbilityId((prev) => {
            const current = prev[abilityId] ?? modes[0];
            const idx = modes.indexOf(current);
            const next = modes[(idx + 1) % modes.length]!;
            return { ...prev, [abilityId]: next };
        });
        sessionRef.current?.getInteractionManager()?.refreshNonconfirmedAbilityMode(abilityId);
    };

    const abilityBar = (
        <AbilityBar
            abilityIds={myAbilityIds}
            playerUnit={
                (activeLocalWaiter != null
                    ? engine.getUnit(activeLocalWaiter.unitId) ?? engine.getLocalPlayerUnit()
                    : engine.getLocalPlayerUnit()) ?? null
            }
            isMyTurn={canUseOrderUi && interactiveTargetingState === 'inactive'}
            roundNumber={roundNumber}
            roundProgress={roundProgress}
            isPaused={isPaused}
            selectedCardIndex={selectedCardIndex}
            onSelectCard={(cardIndex, ability) => sessionRef.current?.getInteractionManager()?.activateAbilityTargeting(cardIndex, ability)}
            onWait={nonconfirmedOrder && !AUTO_END_TURN
                ? () => sessionRef.current?.getInteractionManager()?.handleEndTurn()
                : () => sessionRef.current?.getInteractionManager()?.handleWait()
            }
            hasNonconfirmedOrder={!AUTO_END_TURN && !!nonconfirmedOrder}
            onWaitHoverChange={setIsWaitHovered}
            gameState={engine}
            allUnits={engine.units}
            conditionalCancelContext={conditionalCancelContext}
            abilityModeByAbilityId={abilityModeByAbilityId}
            onCycleAbilityMode={handleCycleAbilityMode}
            onRegisterCardTarget={(key, pageX, pageY) => {
                hudEffectCanvasRef.current?.registerHudFlightTarget(key, pageX, pageY);
            }}
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
                        ghostPlans={ghostPlans}
                    />
                </aside>

                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div ref={battleCanvasAreaRef} className="relative flex min-h-0 flex-1 flex-col">
                        <BossFightHud
                            boss={bossHud}
                            onRegisterCcStatusTarget={(pageX, pageY) => {
                                hudEffectCanvasRef.current?.registerHudFlightTarget('boss:cc_status', pageX, pageY);
                            }}
                        />
                        <WorldModifiersPanel modifiers={activeWorldModifiers} ninjutsuPools={ninjutsuPools} />
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
                        {orderSubmitFailed && (
                            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg bg-red-950/90 px-4 py-2 text-sm text-red-200 shadow-lg ring-1 ring-red-700">
                                <span>Your order was not accepted — please re-issue your turn.</span>
                                <button
                                    className="ml-2 text-red-400 hover:text-red-200"
                                    onClick={() => setOrderSubmitFailed(false)}
                                    aria-label="Dismiss"
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                        {rewindOverlay && (
                            <div
                                key={rewindOverlay.token}
                                className="pointer-events-none absolute inset-0 z-40 transition-opacity ease-out"
                                style={{
                                    opacity: rewindOverlayOpaque ? 1 : 0,
                                    transitionDuration: `${REWIND_OVERLAY_FADE_MS}ms`,
                                }}
                                aria-hidden
                            >
                                {rewindOverlay.frameUrl ? (
                                    <img
                                        src={rewindOverlay.frameUrl}
                                        alt=""
                                        className="absolute inset-0 h-full w-full object-fill"
                                        draggable={false}
                                    />
                                ) : (
                                    <div className="absolute inset-0 bg-dark-900" />
                                )}
                            </div>
                        )}
                        {interactiveTargetingState !== 'inactive'
                            && !(AUTO_END_TURN && interactiveAllTargetsCollected) && (
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 z-50">
                                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border ${
                                    interactiveTargetingState === 'playing'
                                        ? 'bg-green-900/50 border-green-700 text-green-300'
                                        : interactiveTargetingState === 'paused'
                                            ? 'bg-yellow-900/50 border-yellow-700 text-yellow-300'
                                            : 'bg-sky-900/50 border-sky-700 text-sky-300'
                                }`}>
                                    {interactiveTargetingState === 'playing' && <Play className="w-3.5 h-3.5" />}
                                    {interactiveTargetingState === 'paused' && <Pause className="w-3.5 h-3.5" />}
                                    {interactiveTargetingState === 'done' && <Square className="w-3.5 h-3.5" />}
                                    <span>
                                        {interactiveTargetingState === 'playing' ? 'Playing'
                                            : interactiveTargetingState === 'paused' ? 'Paused'
                                            : 'Done'}
                                    </span>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        className="px-3 py-1.5 rounded bg-red-900/60 text-red-300 text-sm hover:bg-red-800/60 border border-red-700"
                                        onClick={() => {
                                            setOrderSubmitFailed(false);
                                            const session = sessionRef.current;
                                            if (session) void session.interactiveTargeting.reset(session);
                                        }}
                                    >
                                        Reset
                                    </button>
                                    <button
                                        className="px-3 py-1.5 rounded bg-sky-900/60 text-sky-300 text-sm hover:bg-sky-800/60 border border-sky-700"
                                        onClick={() => {
                                            setOrderSubmitFailed(false);
                                            const session = sessionRef.current;
                                            if (session) void session.interactiveTargeting.replay(session);
                                        }}
                                    >
                                        Replay
                                    </button>
                                    {!AUTO_END_TURN && (
                                    <button
                                        className={`px-3 py-1.5 rounded text-sm border transition-opacity ${
                                            interactiveTargetingState === 'done'
                                                ? 'bg-primary text-white hover:opacity-90 border-primary cursor-pointer'
                                                : 'bg-dark-800 text-light-600 border-dark-600 opacity-40 cursor-not-allowed'
                                        }`}
                                        disabled={interactiveTargetingState !== 'done'}
                                        onClick={() => {
                                            setOrderSubmitFailed(false);
                                            autoCommitItsAttemptedRef.current = true;
                                            const session = sessionRef.current;
                                            if (session) void session.interactiveTargeting.commit(session);
                                        }}
                                    >
                                        Continue
                                    </button>
                                    )}
                                </div>
                            </div>
                        )}
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
                createPortal(<div className="min-w-0">{abilityBar}</div>, actionRowHost)
            ) : (
                <div className="shrink-0 min-w-0">{abilityBar}</div>
            )}
            <HudEffectCanvas ref={hudEffectCanvasRef} engine={engine} />
        </div>
    );
}
