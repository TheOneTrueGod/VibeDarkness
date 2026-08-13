/**
 * BattlePhase - Main battle phase component.
 *
 * Orchestrates BattleSession (engine / camera / renderer), PixiJS canvas, card hand,
 * round tracking, targeting flow, order submission, and server sync.
 */

import React, { useRef, useState, useCallback, useSyncExternalStore, useEffect } from 'react';
import { useCurrentUser } from '../../../../user/useCurrentUser';
import type { PlayerState, GameSidebarInfo } from '../../../../types';
import type { MinionBattlesApi } from '../../api/minionBattlesApi';
import type { BattleSession } from '../../game/BattleSession';
import {
    type BattleNet,
    BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS,
} from '../../game/battlenet';
import type { AbilityStatic } from '../../abilities/Ability';
import BattleCanvas from '../components/BattleCanvas';
import ObjectiveMarkerOverlay from '../components/ObjectiveMarkerOverlay';
import TurnIndicator from '../components/TurnIndicator';
import { useBattleAbilityBarSlots } from './battlePhase/BattleAbilityBar';
import BattleUISlotLayout from '../../../../components/battleUILayout/BattleUISlotLayout';
import ColumnSlotPartyAndActions from '../components/battleUiSlots/ColumnSlotPartyAndActions';
import type { PlayerTileOrderContext } from '../components/playerTileIndicator';
import { WaitAbility } from '../../abilities/WaitAbility';
import BattleSyncStatus from '../components/BattleSyncStatus';
import BattleHostAnchorBanner from '../components/BattleHostAnchorBanner';
import GameTickPill from '../components/GameTickPill';
import BossFightHud from '../components/boss/BossFightHud';
import WorldModifiersPanel from '../components/WorldModifiersPanel';
import type { MessageEntry } from '../../../../components/Chat';
import { useDebugConsole } from '../../../../contexts/DebugConsoleContext';
import { getShowGameTick, subscribeShowGameTick } from '../../../../debugFlags';
import HudEffectCanvas, { type HudEffectCanvasHandle } from '../components/HudEffectCanvas';
import { MISSION_MAP } from '../../storylines';
import { getAbility } from '../../abilities/AbilityRegistry';
import { getTotalAbilityDurationForCast } from '../../abilities/abilityTimings';
import { handleItsCanvasClick, handleItsCanvasRightClick } from '../../game/interaction/itsCanvasInput';
import BattleLoadingScreen from './battlePhase/BattleLoadingScreen';
import OrderSubmitFailedBanner from './battlePhase/OrderSubmitFailedBanner';
import RewindOverlay from './battlePhase/RewindOverlay';
import { computeTurnIndicatorProps } from './battlePhase/turnIndicatorState';
import { useBossHudPolling } from './battlePhase/useBossHudPolling';
import { useBattleDebugBridge } from './battlePhase/useBattleDebugBridge';
import { useInteractiveTargetingProgress } from './battlePhase/useInteractiveTargetingProgress';
import { useBattleGhostPlans } from './battlePhase/useBattleGhostPlans';
import { useRewindOverlay, REWIND_OVERLAY_FADE_MS } from './battlePhase/useRewindOverlay';
import ITSTimelineControls from '../components/ITSTimelineControls';
import { abilityDurationSecondsToTicks } from '../components/itsTimelineMath';
import { useInteractionManagerBridge } from './battlePhase/useInteractionManagerBridge';
import { useBattleNetSyncState } from './battlePhase/useBattleNetSyncState';
import { useBattleRoundState } from './battlePhase/useBattleRoundState';
import { useBattleSessionLifecycle } from './battlePhase/useBattleSessionLifecycle';
import { useLobbyHostChangeLog } from './battlePhase/useLobbyHostChangeLog';
import { useBattleSidebarPolling } from './battlePhase/useBattleSidebarPolling';
import { useBattleHudPanelsPolling } from './battlePhase/useBattleHudPanelsPolling';
import { useHudEffectCanvasBridge } from './battlePhase/useHudEffectCanvasBridge';
import {
    createEmptyTargetingState,
    computeTargetingState,
    type BattleTargetingState,
} from './battlePhase/battlePhaseTargetingState';

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
    /** Header slot content, built by GameScreen (player/CI/lobby info). */
    headerSlot?: React.ReactNode;
    /** Right column slot content, built by GameScreen (chat). */
    chatSlot?: React.ReactNode;
    /** Loading/resync overlay, built by GameScreen; rendered absolutely within the center slot. */
    centerOverlay?: React.ReactNode;
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
    headerSlot,
    chatSlot,
    centerOverlay,
}: BattlePhaseProps) {
    const { isAdmin } = useCurrentUser();
    const canSubmitOrders = true;

    const { setBattleBridge, adminMovePendingUnitId, setAdminMovePendingUnitId } = useDebugConsole();

    const sessionRef = useRef<BattleSession | null>(null);
    const netRef = useRef<BattleNet | null>(null);
    const hudEffectCanvasRef = useRef<HudEffectCanvasHandle | null>(null);
    const battleCanvasAreaRef = useRef<HTMLDivElement>(null);

    const {
        netSyncStatus,
        setNetSyncStatus,
        netSyncDetails,
        resyncInformAck,
        dismissResyncInformAck,
        waitingForHostCatchup,
        hostCatchupHostTick,
        hostCatchupTargetTick,
        hostCatchupStuckHeartbeats,
        fallingBehindHost,
        ticksBehindHost,
        hostAnchorWaitPhase,
        hostAnchorWaitElapsedMs,
        waitingForHostPollStreak,
        blockingHostPausePlane,
        orderPipeline,
        hasReceivedInitialHeartbeat,
        wireNetEvents,
    } = useBattleNetSyncState({ isHost, onBattleNetResyncingChange });

    const {
        roundNumber,
        roundProgress,
        isPaused,
        waitingForOrders,
        activeLocalWaiter,
        myAbilityIds,
        storyPauseActive,
        orderSubmitFailed,
        setOrderSubmitFailed,
        handleSessionEvent: handleRoundSessionEvent,
    } = useBattleRoundState({ playerId, hudEffectCanvasRef });

    const [_isWaitHovered, setIsWaitHovered] = useState(false);
    /** Ability hovered in the AbilityBar (only set while the card is selectable); overrides the timeline preview. */
    const [hoveredAbility, setHoveredAbility] = useState<AbilityStatic | null>(null);

    const {
        interactiveTargetingState,
        playerTileRefresh,
        getItsPlayaheadTicks,
        autoCommitItsAttemptedRef,
    } = useInteractiveTargetingProgress({
        sessionRef,
        activeLocalWaiter,
        setOrderSubmitFailed,
    });
    const itsPreviewActive = interactiveTargetingState !== 'inactive';

    const { renderGhostPlans, setPeerGhostPlansVisibleAfterRewind } = useBattleGhostPlans({
        sessionRef,
        playerId,
        itsPreviewActive,
    });

    const { rewindOverlay, rewindOverlayOpaque, captureAndFade } = useRewindOverlay({
        battleCanvasAreaRef,
        hudEffectCanvasRef,
    });
    const [rewindSeed, setRewindSeed] = useState<{
        savedLocalTick: number;
        playaheadTick: number;
        expectedDurationTicks: number;
    } | null>(null);

    useEffect(() => {
        if (rewindOverlay == null) {
            setRewindSeed(null);
        }
    }, [rewindOverlay]);

    const handleSessionEvent = useCallback(
        (ev: Parameters<typeof handleRoundSessionEvent>[0], session: BattleSession) => {
            if (ev.type === 'sequential_targeting_rewind') {
                // Capture peak ticks + ability span before restore — ITS/engine still at playahead here.
                const ticks = getItsPlayaheadTicks();
                let expectedDurationTicks = 0;
                const its = session.interactiveTargeting;
                const eng = session.getEngine();
                if (its.isActive && eng != null && its.abilityId != null && its.unitId != null) {
                    const ability = getAbility(its.abilityId);
                    const caster = eng.getUnit(its.unitId);
                    if (ability && caster) {
                        try {
                            const durationSec = getTotalAbilityDurationForCast(ability, caster, eng);
                            expectedDurationTicks = abilityDurationSecondsToTicks(durationSec);
                        } catch {
                            // keep defaults
                        }
                    }
                }
                setRewindSeed(
                    ticks != null
                        ? { ...ticks, expectedDurationTicks }
                        : null,
                );
                setPeerGhostPlansVisibleAfterRewind(true);
                // Hold sim resume until the DOM crossfade finishes.
                session.deferRewindPresentationUntilNotified();
                captureAndFade(session);
                return;
            }
            handleRoundSessionEvent(ev, session);
        },
        [captureAndFade, getItsPlayaheadTicks, handleRoundSessionEvent, setPeerGhostPlansVisibleAfterRewind],
    );
    const handleSessionEventRef = useRef(handleSessionEvent);
    handleSessionEventRef.current = handleSessionEvent;

    useBattleDebugBridge({
        sessionRef,
        netRef,
        setBattleBridge,
        adminMovePendingUnitId,
        setAdminMovePendingUnitId,
    });

    const { bossHud } = useBossHudPolling(sessionRef);

    const targetingStateRef = useRef<BattleTargetingState>(createEmptyTargetingState());
    // Computed in the component body so it's always current before each render.
    // BattleCanvas reads targetingStateRef.current.selectedAbility to suppress drag-to-pan.
    // This must stay a plain render-body assignment (not an effect) — BattleCanvas's RAF loop
    // reads the ref synchronously.
    targetingStateRef.current = computeTargetingState(sessionRef.current, {
        waitingForOrders,
        activeLocalWaiterUnitId: activeLocalWaiter?.unitId ?? null,
        ghostPlans: renderGhostPlans,
    });
    const { activeWorldModifiers, ninjutsuPools } = useBattleHudPanelsPolling(sessionRef);

    const { battleInitPhase } = useBattleSessionLifecycle({
        api,
        missionId,
        playerId,
        isHost,
        players,
        characterSelections,
        initialGameState,
        onVictory,
        onDefeat,
        onEmittedChatMessage,
        sessionRef,
        netRef,
        wireNetEvents,
        onSessionEventRef: handleSessionEventRef,
        setNetSyncStatus,
    });

    const showGameTick = useSyncExternalStore(
        subscribeShowGameTick,
        getShowGameTick,
        getShowGameTick,
    );

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

    const {
        selectedCardIndex,
        selectedAbility,
        nonconfirmedOrder,
        abilityModeByAbilityId,
        handleCycleAbilityMode,
        handleSetAbilityMode,
    } = useInteractionManagerBridge({
        sessionRef,
        canUseOrderUi,
        waitingForOrders,
        myAbilityIds,
        battleInitPhase,
        playerTileRefresh,
    });

    const showHostCatchupPopover =
        !isHost &&
        isPaused &&
        waitingForHostCatchup &&
        hostCatchupStuckHeartbeats >= HOST_WAIT_POPOVER_AFTER_HEARTBEATS;

    useLobbyHostChangeLog(players, api, playerId, sessionRef);
    useBattleSidebarPolling(roundNumber, players, characterSelections, sessionRef, onSidebarInfoChange);
    useHudEffectCanvasBridge(battleInitPhase, sessionRef, hudEffectCanvasRef, battleCanvasAreaRef);

    // ========================================================================
    // Canvas event callbacks — delegate to manager.
    // ========================================================================
    const handleCanvasClick = useCallback((screenX: number, screenY: number) => {
        const session = sessionRef.current;
        if (session && handleItsCanvasClick(session, screenX, screenY)) {
            return;
        }
        session?.getInteractionManager()?.onCanvasClick(screenX, screenY);
    }, []);

    const handleCanvasRightClick = useCallback((screenX: number, screenY: number, shiftKey: boolean, ctrlKey: boolean) => {
        const session = sessionRef.current;
        if (session && handleItsCanvasRightClick(session, screenX, screenY, shiftKey, ctrlKey)) {
            return;
        }
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

    const itsForPlayerTile = sessionRef.current?.interactiveTargeting;
    const playerTileOrderContext: PlayerTileOrderContext | undefined = !engine
        ? undefined
        : itsPreviewActive && itsForPlayerTile?.isActive
          ? itsForPlayerTile.getMarkOrderContextForUi()
          : {
                waitingForOrders: engine.waitingForOrders,
                pendingOrders: engine.state.orderMgr.pendingOrders,
            };
    void playerTileRefresh;

    const showWebRtcConnectionStatus = Object.keys(players).length > 1;

    const turnIndicatorState = computeTurnIndicatorProps({
        waitingForOrders,
        storyPauseActive,
        canUseOrderUi,
        playerId,
        players,
    });

    const turnIndicatorElement = (
        <TurnIndicator
            state={turnIndicatorState.state}
            allyName={turnIndicatorState.allyName}
            freezePresentation={rewindOverlay != null}
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
            itsControls={
                interactiveTargetingState !== 'inactive' || rewindOverlay != null
                    ? (
                        <ITSTimelineControls
                            state={
                                interactiveTargetingState === 'inactive'
                                    ? 'paused'
                                    : interactiveTargetingState
                            }
                            sessionRef={sessionRef}
                            getItsPlayaheadTicks={getItsPlayaheadTicks}
                            setOrderSubmitFailed={setOrderSubmitFailed}
                            autoCommitItsAttemptedRef={autoCommitItsAttemptedRef}
                            rewindToken={rewindOverlay?.token ?? null}
                            rewindSeed={rewindSeed}
                            rewindDurationMs={REWIND_OVERLAY_FADE_MS}
                        />
                    )
                    : null
            }
        />
    );

    const abilityBarSlots = useBattleAbilityBarSlots({
        sessionRef,
        hudEffectCanvasRef,
        engine,
        myAbilityIds,
        activeLocalWaiter,
        canUseOrderUi,
        interactiveTargetingState,
        roundNumber,
        roundProgress,
        isPaused,
        selectedCardIndex,
        nonconfirmedOrder,
        abilityModeByAbilityId,
        handleCycleAbilityMode,
        handleSetAbilityMode,
        setIsWaitHovered,
        setHoveredAbility,
        turnIndicator: turnIndicatorElement,
    });

    if (!isHost && !hasReceivedInitialHeartbeat) {
        return <BattleLoadingScreen message="You must gather your party before venturing forth." />;
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
        return <BattleLoadingScreen message={loadingLabel} />;
    }

    // itsActive/itsAbility/itsUnitId feed the BattleTimeline preview props below so the timeline
    // reflects the ITS ability even before it has an active-ability instance (e.g. the very
    // first target select, which pauses the engine before queuing any order).
    const its = sessionRef.current?.interactiveTargeting;
    const itsActive = its?.isActive ?? false;
    const itsAbilityId = itsActive && its ? its.abilityId : null;
    const itsUnitId = itsActive && its ? its.unitId : null;
    const itsAbility = itsAbilityId ? getAbility(itsAbilityId) : null;

    return (
        <>
            <BattleUISlotLayout
                header={headerSlot}
                leftColumn={
                    <ColumnSlotPartyAndActions
                        engine={engine}
                        players={players}
                        localPlayerId={playerId}
                        previewAbility={
                            itsActive && itsAbility
                                ? itsAbility
                                : canUseOrderUi
                                  ? (hoveredAbility ?? selectedAbility ?? WaitAbility)
                                  : null
                        }
                        previewOrderUnitId={itsActive && itsUnitId ? itsUnitId : (activeLocalWaiter?.unitId ?? null)}
                        ghostPlans={renderGhostPlans}
                        playerTileOrderContext={playerTileOrderContext}
                        showWebRtcConnectionStatus={showWebRtcConnectionStatus}
                    />
                }
                rightColumn={chatSlot}
                center={
                    <div className="relative flex h-full min-h-0 w-full flex-col">
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
                            {showGameTick ? (
                                <div className="pointer-events-none absolute right-3 top-3 z-20">
                                    <GameTickPill getItsTicks={getItsPlayaheadTicks} />
                                </div>
                            ) : null}
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
                                <OrderSubmitFailedBanner onDismiss={() => setOrderSubmitFailed(false)} />
                            )}
                            {rewindOverlay && (
                                <RewindOverlay overlay={rewindOverlay} opaque={rewindOverlayOpaque} />
                            )}
                        </div>

                        {centerOverlay}
                    </div>
                }
                bottomLeftCorner={abilityBarSlots.bottomLeftCorner}
                bottomRow={abilityBarSlots.bottomRow}
                bottomRightCorner={abilityBarSlots.bottomRightCorner}
            />
            <HudEffectCanvas ref={hudEffectCanvasRef} engine={engine} />
        </>
    );
}
