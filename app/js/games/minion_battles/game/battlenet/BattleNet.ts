import type { LobbyClient } from '../../../../LobbyClient';
import { traceBattleHeartbeatLine } from '../../../../battleHeartbeatTrace';
import { logToLobbyLog, logToLobbyLogBattleSync } from '../../../../lobbyLog';
import type { BattleOrder, SerializedGameState } from '../types';
import { hashOrderId } from './helpers/orderHashing';
import { BattleEventBus } from './BattleEventBus';
import { SyncStatusController } from './SyncStatusController';
import { HeartbeatHttp } from './HeartbeatHttp';
import { HeartbeatState } from './HeartbeatState';
import { FingerprintBatcher } from './FingerprintBatcher';
import { SnapshotPersistence } from './SnapshotPersistence';
import { OrderQueueController } from './OrderQueueController';
import { SyncReconciler } from './SyncReconciler';
import { HeartbeatTerminalReconciler } from './HeartbeatTerminalReconciler';
import { HostAnchorWaitController } from './HostAnchorWaitController';
import { RecoveryCoordinator } from './RecoveryCoordinator';
import { PollLoop } from './PollLoop';
import type { BattleNetContext } from './BattleNetContext';
import {
    BATTLE_NET_WAITING_HOST_UI_FORCE_RESYNC_POLLS,
    BATTLE_NET_BEHIND_HOST_TICKS_THRESHOLD,
    BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS,
} from './constants';
import type {
    BattleSessionHandle,
    BattleNetEventMap,
    BattleNetListener as Listener,
    BattleNetUnsub as Unsub,
    BattleApi,
    BattleNetArgs,
    BattleNetPollOnceOptions,
    BattleHeartbeatApiResult,
    BattleNetFactoryArgs,
} from './types';

export {
    BATTLE_NET_T1_WAITING_POLLS,
    BATTLE_NET_T2_RESYNC_POLLS,
    BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS,
    BATTLE_NET_WAITING_HOST_UI_FORCE_RESYNC_POLLS,
    HOST_ANCHOR_WAIT_SHOW_MS,
    HOST_ANCHOR_RESYNC_MS,
    BATTLE_NET_BEHIND_HOST_TICKS_THRESHOLD,
    BATTLE_NET_MAX_DEFERRED_ORDERS,
    BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS,
} from './constants';
export type {
    BattleSessionHandle,
    BattleNetSyncTerminalStatus,
    BattleNetPollOnceOptions,
    BattleNetFactoryArgs,
} from './types';

/** Monotonic id for `traceBattleHeartbeatLine` (`heartbeatTraceInstanceId`). */
let battleHeartbeatTraceInstanceSeq = 0;

export class BattleNet implements BattleNetContext {
    readonly api: BattleApi;
    readonly session: BattleSessionHandle;
    readonly isHost: boolean;
    readonly lobbyId: string;
    readonly gameId: string;
    readonly playerId: string;
    /** Correlates all `traceBattleHeartbeatLine` rows for this `BattleNet` instance. */
    readonly heartbeatTraceInstanceId = ++battleHeartbeatTraceInstanceSeq;

    readonly events: BattleEventBus = new BattleEventBus();
    private readonly syncStatusController: SyncStatusController = new SyncStatusController(this.events);
    readonly heartbeatState: HeartbeatState = new HeartbeatState();
    readonly heartbeatHttp: HeartbeatHttp;
    readonly fingerprintBatcher: FingerprintBatcher;
    readonly snapshotPersistence: SnapshotPersistence;
    readonly orderQueue: OrderQueueController;
    readonly syncReconciler: SyncReconciler;
    private readonly heartbeatTerminalReconciler: HeartbeatTerminalReconciler;
    readonly hostAnchorWait: HostAnchorWaitController;
    readonly recovery: RecoveryCoordinator;
    readonly pollLoop: PollLoop;

    /** {@link BattleNetContext} requires the controllers as a public surface for siblings. */
    get syncStatus(): SyncStatusController {
        return this.syncStatusController;
    }

    get isRecovering(): boolean {
        return this.recovery.isRecovering;
    }

    // PollLoop bridge accessors for legacy in-class callers (pollOnce body, watchdog branches).
    private get heartbeatPollSeq(): number {
        return this.pollLoop.heartbeatPollSeq;
    }
    private set heartbeatPollSeq(v: number) {
        this.pollLoop.heartbeatPollSeq = v;
    }
    private get isPolling(): boolean {
        return this.pollLoop.isPolling;
    }
    private set isPolling(v: boolean) {
        this.pollLoop.isPolling = v;
    }
    private get waitingForHostUiPollStreak(): number {
        return this.pollLoop.waitingForHostUiPollStreak;
    }
    private set waitingForHostUiPollStreak(v: number) {
        this.pollLoop.waitingForHostUiPollStreak = v;
    }
    // HostAnchorWaitController bridge accessors for legacy in-class callers.
    private get previouslySyncedAtTick(): number | null {
        return this.hostAnchorWait.getPreviouslySyncedAtTick();
    }
    private set previouslySyncedAtTick(v: number | null) {
        this.hostAnchorWait.setPreviouslySyncedAtTick(v);
    }
    private get hostAnchorWaitStartedAtMs(): number | null {
        return this.hostAnchorWait.getHostAnchorWaitStartedAtMs();
    }
    private set hostAnchorWaitStartedAtMs(v: number | null) {
        this.hostAnchorWait.setHostAnchorWaitStartedAtMs(v);
    }
    private get hostAnchorResyncEmittedForCurrentStall(): boolean {
        return this.hostAnchorWait.getHostAnchorResyncEmittedForCurrentStall();
    }
    private set hostAnchorResyncEmittedForCurrentStall(v: boolean) {
        this.hostAnchorWait.setHostAnchorResyncEmittedForCurrentStall(v);
    }
    constructor(args: BattleNetArgs) {
        this.api = args.api as unknown as BattleApi;
        this.session = args.session;
        this.isHost = args.isHost;
        this.lobbyId = args.lobbyId;
        this.gameId = args.gameId;
        this.playerId = args.playerId;
        this.heartbeatHttp = new HeartbeatHttp({
            api: this.api,
            lobbyId: this.lobbyId,
            gameId: this.gameId,
            playerId: this.playerId,
            heartbeatTraceInstanceId: this.heartbeatTraceInstanceId,
        });
        this.fingerprintBatcher = new FingerprintBatcher({
            api: this.api,
            isHost: this.isHost,
            lobbyId: this.lobbyId,
            gameId: this.gameId,
            playerId: this.playerId,
        });
        this.snapshotPersistence = new SnapshotPersistence({
            api: this.api,
            session: this.session,
            isHost: this.isHost,
            lobbyId: this.lobbyId,
            gameId: this.gameId,
            playerId: this.playerId,
            requestResync: (reason) => this.requestResync(reason),
        });
        this.syncReconciler = new SyncReconciler(this as unknown as BattleNetContext);
        this.heartbeatTerminalReconciler = new HeartbeatTerminalReconciler(this);
        this.orderQueue = new OrderQueueController(this);
        this.hostAnchorWait = new HostAnchorWaitController(this);
        this.hostAnchorWait.bindSiblings({
            orderQueue: this.orderQueue,
            syncReconciler: this.syncReconciler,
        });
        this.recovery = new RecoveryCoordinator(this);
        this.recovery.bindSiblings({
            orderQueue: this.orderQueue,
            syncReconciler: this.syncReconciler,
        });
        this.pollLoop = new PollLoop(this);
        this.pollLoop.bindSiblings({
            orderQueue: this.orderQueue,
            syncReconciler: this.syncReconciler,
            pollOnce: (opts) => this.pollOnce(opts),
        });
    }

    start(): void {
        this.pollLoop.start();
    }

    stop(): void {
        this.pollLoop.stop();
    }

    on<K extends keyof BattleNetEventMap>(event: K, cb: Listener<K>): Unsub {
        return this.events.on(event, cb);
    }

    off<K extends keyof BattleNetEventMap>(event: K, cb: Listener<K>): void {
        this.events.off(event, cb);
    }

    /**
     * Local player order sync pipeline (optimistic submit vs server `orders.jsonl`).
     * Delegates to {@link OrderQueueController.getOrderSyncSummary}.
     */
    getOrderSyncSummary(): { queued: number; sending: number } {
        return this.orderQueue.getOrderSyncSummary();
    }

    // Accessors that bridge legacy field-style access from the bigger order-flow methods
    // (submitOrder/persistOrder/flushDeferredOrdersUpTo/...) to the controller until those
    // methods are themselves moved in `slim_and_cleanup`.
    private get deferredLocalOrders() {
        return this.orderQueue.getDeferredLocalOrders();
    }
    private set deferredLocalOrders(next: ReturnType<OrderQueueController['getDeferredLocalOrders']>) {
        this.orderQueue.replaceDeferredLocalOrders(next);
    }
    private get appliedOrderIdHashes() {
        return this.orderQueue.getAppliedOrderIdHashes();
    }
    private get ourOrdersAwaitingServerRange() {
        return this.orderQueue.getOurOrdersAwaitingServerRange();
    }
    private get serverRangeConfirmedOurOrderHashes() {
        return this.orderQueue.getServerRangeConfirmedOurOrderHashes();
    }
    private get lastOrderFetchSince(): number {
        return this.orderQueue.getLastOrderFetchSince();
    }
    private set lastOrderFetchSince(v: number) {
        this.orderQueue.setLastOrderFetchSince(v);
    }
    private get lastSeenOrdersRecordCount(): number {
        return this.orderQueue.getLastSeenOrdersRecordCount();
    }
    private set lastSeenOrdersRecordCount(v: number) {
        this.orderQueue.setLastSeenOrdersRecordCount(v);
    }
    private get hostCatchupHeartbeatStreak(): number {
        return this.orderQueue.getHostCatchupHeartbeatStreak();
    }
    private set hostCatchupHeartbeatStreak(v: number) {
        this.orderQueue.setHostCatchupHeartbeatStreak(v);
    }

    async submitOrder(order: BattleOrder, atTick: number): Promise<void> {
        if (this.isRecovering) {
            const whyImmediateSubmitSkipped =
                'submitOrder did not reach appendBattleOrder: desync recovery is active';
            console.warn('[BattleNet] immediate submit skipped', {
                why: whyImmediateSubmitSkipped,
                lobbyId: this.lobbyId,
                gameId: this.gameId,
                atTick,
                unitId: order.unitId,
                abilityId: order.abilityId,
            });
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'submitOrder early exit: skipped while desync recovery is active',
                context: {
                    whyImmediateSubmitSkipped,
                    isHost: this.isHost,
                    abilityId: order.abilityId,
                    unitId: order.unitId,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    localEngineTick: this.session.getEngineTick(),
                    localLatestFingerprintTick: this.session.getLatestFingerprint()?.tick ?? null,
                    isPausedForOrderSync: this.session.isPausedForOrderSync(),
                    queuedDeferredBeforeSubmit: this.deferredLocalOrders.length,
                },
            });
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'submitOrder skipped: recovery active (no immediate POST)',
                context: { why: whyImmediateSubmitSkipped, unitId: order.unitId, abilityId: order.abilityId },
            });
            return;
        }
        if (this.syncStatusController.isAwaitingUserAck()) {
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'info',
                gameId: this.gameId,
                message: 'submitOrder skipped until user acknowledges post-resync continue',
                context: { abilityId: order.abilityId, unitId: order.unitId },
            });
            return;
        }
        const idHash = hashOrderId(this.playerId, atTick, order);
        const localEngineTick = this.session.getEngineTick();
        const localLatestFingerprint = this.session.getLatestFingerprint();
        const localLatestFingerprintTick = localLatestFingerprint?.tick ?? null;
        const effectiveHostTickCandidate =
            this.isHost && localLatestFingerprintTick != null
                ? Math.max(this.latestHeartbeatHostTick, localLatestFingerprintTick)
                : null;

        if (!this.isHost && localEngineTick > this.latestHeartbeatHostTick) {
            if (this.appliedOrderIdHashes.has(idHash)) {
                return;
            }
            if (!this.deferredLocalOrders.some((r) => r.idHash === idHash)) {
                this.deferLocalOrder(idHash, atTick, order, false);
            }
            this.syncStatusController.presentWaitingForHostLocalAheadOfHeartbeat();
            this.emitHostCatchupWaitState();
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'info',
                gameId: this.gameId,
                message: 'submitOrder deferred local apply — client ahead of heartbeat hostTick',
                context: {
                    idHash,
                    abilityId: order.abilityId,
                    unitId: order.unitId,
                    atTick,
                    localEngineTick,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    queuedDeferredAfter: this.deferredLocalOrders.length,
                },
            });
            return;
        }

        if (!this.appliedOrderIdHashes.has(idHash)) {
            this.appliedOrderIdHashes.add(idHash);
            this.session.applyRemoteOrders([{ atTick, order }]);
            this.emit('orders-applied', { count: 1, source: 'submit' });
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'info',
                gameId: this.gameId,
                message: 'optimistic local order applied before server confirmation',
                context: {
                    idHash,
                    abilityId: order.abilityId,
                    unitId: order.unitId,
                    order,
                    isHost: this.isHost,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    localEngineTick,
                    localLatestFingerprintTick,
                    effectiveHostTickCandidate,
                    isPausedForOrderSync: this.session.isPausedForOrderSync(),
                    queuedDeferredBeforeSubmit: this.deferredLocalOrders.length,
                },
            });
        }
        this.ourOrdersAwaitingServerRange.add(idHash);

        // Defer only when more than one tick ahead of the host's last completed tick.
        // Orders for `hostTick + 1` (same as current `orderBatchAtTick` when paused) must POST while paused.
        const isPausedForOrderSync = this.session.isPausedForOrderSync();
        const orderBatchHeartbeat = this.latestHeartbeatPausedAtTick;
        const heartbeatHostTick = this.latestHeartbeatHostTick;
        const pausedAtGate = orderBatchHeartbeat != null && atTick <= orderBatchHeartbeat;
        const hostSlackGate = atTick <= heartbeatHostTick + 2;
        const allowImmediatePostForCurrentPauseBatch =
            !this.isHost &&
            isPausedForOrderSync &&
            // Heartbeats can lag while both peers are paused; allow hostTick+2 slack for POST.
            (pausedAtGate || hostSlackGate);
        if (!this.isHost && atTick > heartbeatHostTick + 1 && !allowImmediatePostForCurrentPauseBatch) {
            const tailPlusOne = heartbeatHostTick + 1;
            let whyImmediateSubmitSkipped: string;
            if (!isPausedForOrderSync) {
                whyImmediateSubmitSkipped =
                    `atTick=${atTick} > hostTick+1 (${tailPlusOne}) and engine not paused for order sync — POST slack only applies while paused waiting for parallel orders`;
            } else if (orderBatchHeartbeat === null) {
                whyImmediateSubmitSkipped =
                    `atTick=${atTick} > hostTick+2 (${heartbeatHostTick + 2}); paused locally but heartbeat has no orderBatch/pausedAtTick (hostTick+2 slack exhausted)`;
            } else {
                whyImmediateSubmitSkipped =
                    `atTick=${atTick} outside immediate-post windows: need atTick<=${orderBatchHeartbeat} (order batch) or atTick<=${heartbeatHostTick + 2} (hostTick+2)`;
            }
            this.deferLocalOrder(idHash, atTick, order, true);
            if (isPausedForOrderSync) {
                this.syncStatusController.presentWaitingForHostOptimisticQueued();
            }
            this.emitHostCatchupWaitState();
            console.info('[BattleNet] immediate submit skipped — order queued deferred', {
                why: whyImmediateSubmitSkipped,
                lobbyId: this.lobbyId,
                gameId: this.gameId,
                idHash,
                atTick,
                heartbeatHostTick,
                heartbeatPausedAtTick: orderBatchHeartbeat,
                isPausedForOrderSync,
                pausedAtGate,
                hostSlackGate,
                queuedDeferredAfter: this.deferredLocalOrders.length,
            });
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'info',
                gameId: this.gameId,
                message: 'submitOrder early exit: deferred before POST because order tick is ahead of host',
                context: {
                    whyImmediateSubmitSkipped,
                    isHost: false,
                    idHash,
                    abilityId: order.abilityId,
                    unitId: order.unitId,
                    atTick,
                    lastSeenHeartbeatHostTick: heartbeatHostTick,
                    maxImmediatePostTick: heartbeatHostTick + 1,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    localEngineTick,
                    localLatestFingerprintTick,
                    latestHeartbeatPausedAtTick: orderBatchHeartbeat,
                    isPausedForOrderSync,
                    pausedAtGate,
                    hostSlackGate,
                    queuedDeferredAfter: this.deferredLocalOrders.length,
                },
            });
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'info',
                gameId: this.gameId,
                message: 'submitOrder deferred until host tick catches up',
                context: {
                    isHost: false,
                    whyImmediateSubmitSkipped,
                    lastSeenHeartbeatHostTick: heartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    queuedAfter: this.deferredLocalOrders.length,
                },
            });
            return;
        }

        await this.persistOrder(order, atTick, idHash, true);
    }

    async saveInitialState(): Promise<void> {
        return this.snapshotPersistence.saveInitialState();
    }

    async getBattleInitialState(): Promise<{ state: SerializedGameState; initialFingerprint: string } | null> {
        return this.snapshotPersistence.getBattleInitialState();
    }

    requestResync(_reason: string): void {
        if (this.isRecovering) {
            return;
        }
        void this.runDesyncRecovery(_reason);
    }

    queueFingerprint(tick: number, fp: string, paused: boolean): void {
        this.fingerprintBatcher.queueFingerprint(tick, fp, paused);
    }

    async saveSnapshotOnPause(tick: number, state: SerializedGameState): Promise<void> {
        return this.snapshotPersistence.saveSnapshotOnPause(tick, state);
    }

    /**
     * Host-only: after local parallel batch orders are satisfied, persist pending → applied on the server.
     * Retries up to three times; returns false on total failure (`requestResync` already armed).
     */
    async mergeAppliedOrdersForBatch(batchAtTick: number): Promise<boolean> {
        return this.snapshotPersistence.mergeAppliedOrdersForBatch(batchAtTick);
    }

    /** Clears the post-recovery "Continue" UX gate (see {@link BATTLE_RESYNC_AUTO_RESUME_AFTER_DESYNC}). */
    acknowledgeRecoveryContinue(): void {
        this.syncStatusController.acknowledgeRecoveryContinue();
    }

    /**
     * Debug: serializes the live engine via {@link BattleSessionHandle.getSerializedSnapshot}, logs it to
     * `lobby_log.jsonl` at **critical** severity, then (host only) POSTs the same payload through
     * `saveBattleSnapshot` — not React/debug-buffered lobby state.
     */
    async debugLogLocalStateAndSubmitSnapshot(): Promise<void> {
        return this.snapshotPersistence.debugLogLocalStateAndSubmitSnapshot();
    }

    async pollOnce(opts?: BattleNetPollOnceOptions): Promise<void> {
        const pollSource = opts?.pollSource ?? 'unknown';
        if (this.isPolling || this.isRecovering) {
            traceBattleHeartbeatLine('pollOnce skipped (busy)', {
                traceInstanceId: this.heartbeatTraceInstanceId,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                pollSource,
                isPolling: this.isPolling,
                isRecovering: this.isRecovering,
            });
            return;
        }
        this.isPolling = true;
        const pollSeq = ++this.heartbeatPollSeq;
        traceBattleHeartbeatLine('pollOnce begin', {
            traceInstanceId: this.heartbeatTraceInstanceId,
            pollSeq,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            pollSource,
            engineTick: this.session.getEngineTick(),
        });
        try {
            if (!opts?.forceHttp && this.session.isDebugSimulationFrozen()) {
                traceBattleHeartbeatLine('pollOnce end (debug sim frozen)', {
                    traceInstanceId: this.heartbeatTraceInstanceId,
                    pollSeq,
                    pollSource,
                });
                return;
            }

            const hbStarted = performance.now();
            const hbRaw = await this.getBattleHeartbeatThrottled({
                gameTick: this.session.getEngineTick(),
                bypassThrottle: opts?.forceHttp === true,
                tracePhase: `poll:${pollSource}`,
            });
            traceBattleHeartbeatLine('pollOnce heartbeat received', {
                traceInstanceId: this.heartbeatTraceInstanceId,
                pollSeq,
                pollSource,
                httpMs: Math.round((performance.now() - hbStarted) * 100) / 100,
                hostTick: hbRaw.hostTick ?? null,
                hostPaused: hbRaw.hostPaused === true,
                heartbeatSeq: hbRaw.heartbeatSeq ?? null,
            });
            const ordersRecordCountRaw = hbRaw.ordersRecordCount;
            const ordersRecordCount =
                typeof ordersRecordCountRaw === 'number' && !Number.isNaN(ordersRecordCountRaw)
                    ? ordersRecordCountRaw
                    : null;
            const orderBatchFromRaw = hbRaw.orderBatchAtTick ?? hbRaw.pausedAtTick;
            const orderBatchAtTick =
                typeof orderBatchFromRaw === 'number' && !Number.isNaN(orderBatchFromRaw) ? orderBatchFromRaw : null;
            const hb: BattleNetEventMap['heartbeat'] = {
                hostTick: hbRaw.hostTick ?? 0,
                hostFingerprint: hbRaw.hostFingerprint ?? null,
                hostPaused: hbRaw.hostPaused === true,
                ordersTipTick: hbRaw.ordersTipTick ?? -1,
                ordersRecordCount,
                orderBatchAtTick,
                pausedAtTick: hbRaw.pausedAtTick ?? null,
                expectingFromPlayerIds: hbRaw.expectingFromPlayerIds ?? null,
                initialFingerprint: hbRaw.initialFingerprint ?? null,
                heartbeatSeq: typeof hbRaw.heartbeatSeq === 'number' && !Number.isNaN(hbRaw.heartbeatSeq) ? hbRaw.heartbeatSeq : 0,
                pendingOrders:
                    hbRaw.pendingOrders ??
                    ((hbRaw as { minimalPendingOrders?: unknown }).minimalPendingOrders as
                        | Array<Record<string, unknown>>
                        | undefined),
                appliedOrdersAtTick: hbRaw.appliedOrdersAtTick,
                latestServerGameTick:
                    hbRaw.latestServerGameTick ?? (typeof hbRaw.hostTick === 'number' ? hbRaw.hostTick : null),
                latestServerGameHash:
                    hbRaw.latestServerGameHash ??
                    (typeof hbRaw.hostFingerprint === 'string' ? hbRaw.hostFingerprint : null),
                gameTick: hbRaw.gameTick ?? null,
                gameHash: hbRaw.gameHash ?? null,
                fingerprintTailTick:
                    typeof hbRaw.fingerprintTailTick === 'number' && !Number.isNaN(hbRaw.fingerprintTailTick)
                        ? hbRaw.fingerprintTailTick
                        : null,
                fingerprintTailFingerprint:
                    typeof hbRaw.fingerprintTailFingerprint === 'string' ? hbRaw.fingerprintTailFingerprint : null,
            };
            let heartbeatMaterialChanged = false;
            if (!this.isHost) {
                heartbeatMaterialChanged = this.heartbeatState.observeMaterialChange(
                    hb.hostTick,
                    hb.hostFingerprint,
                );
                if (heartbeatMaterialChanged) {
                    this.resetNonHostAheadStreak();
                }
            } else {
                this.heartbeatState.clearLastPollMaterialChanged();
            }
            this.updateLastSeenHeartbeat(hb.hostTick);
            this.latestHeartbeatPausedAtTick = orderBatchAtTick;
            this.emit('heartbeat', hb);
            if (this.isHost) {
                this.session.setMultiplayerAwaitHostCatchup(false);
            }

            if (!this.isHost) {
                await this.flushDeferredOrdersUpTo(hb.hostTick);
                const paused = this.session.isPausedForOrderSync();
                const blocking = this.deferredLocalOrders.length > 0;
                if (blocking && paused) {
                    this.hostCatchupHeartbeatStreak += 1;
                } else {
                    this.hostCatchupHeartbeatStreak = 0;
                }
                this.emitHostCatchupWaitState();
                await this.maybeForceFlushDeferredOrder(hb.hostTick);
            }

            const revisionFetch =
                ordersRecordCount !== null && ordersRecordCount > this.lastSeenOrdersRecordCount;
            const legacyFetch = ordersRecordCount === null && hb.ordersTipTick >= this.lastOrderFetchSince;

            // Pull newly published peer orders:
            // - Legacy: gate on ordersTipTick (max atTick); cheap but misses a second append at same atTick.
            // - Preferred: heartbeat.ordersRecordCount (row count); any append triggers refetch-from-zero + idHash dedupe.
            if (revisionFetch || legacyFetch) {
                await this.fetchAndApplyNewOrders(hb.ordersTipTick, {
                    rescanOrdersFromTickZero: revisionFetch,
                    serverOrderRecordCount: ordersRecordCount,
                });
            }

            const engineTick = this.session.getEngineTick();

            if (!this.isHost) {
                const behind = hb.hostTick - engineTick;
                if (behind > BATTLE_NET_BEHIND_HOST_TICKS_THRESHOLD) {
                    this.emit('falling-behind', { active: true, ticksBehind: behind });
                } else {
                    this.emit('falling-behind', { active: false, ticksBehind: Math.max(0, behind) });
                }
                this.heartbeatTerminalReconciler.reconcileNonHostBehindHostTail(engineTick, hb, heartbeatMaterialChanged);
            }

            if (!this.isHost && engineTick < hb.hostTick) {
                this.resetNonHostAheadStreak();
            }

            if (engineTick === hb.hostTick) {
                this.heartbeatTerminalReconciler.reconcileFingerprintsEqualHostTick(engineTick, hb);
            } else if (!this.isHost && engineTick > hb.hostTick) {
                this.heartbeatTerminalReconciler.reconcileNonHostAheadOfHostTail(engineTick, hb);
            }

            if (!this.isHost) {
                if (engineTick < hb.hostTick) {
                    this.clearHostAnchorWaitState();
                    this.emitBlockingHostPausePlane(false);
                } else {
                    this.refreshHostAnchorWaitAndBlocking(engineTick, hb);
                }
                const prevPlane = this.syncReconciler.getLastNonHostHbPausePlane();
                if (
                    prevPlane !== null &&
                    this.syncReconciler.pausePlaneKeyFromSnap(prevPlane) !== this.syncReconciler.pausePlaneKeyFromHb(hb)
                ) {
                    this.heartbeatTerminalReconciler.reconcileNonHostPausePlaneTransition(prevPlane, hb, engineTick);
                }
                this.syncReconciler.setLastNonHostHbPausePlane(this.syncReconciler.snapshotHbPausePlane(hb));
                this.session.setMultiplayerAwaitHostCatchup(engineTick > hb.hostTick);
            }

            if (this.isHost) {
                await this.flushFingerprints();
            }

            if (!this.isHost) {
                if (
                    this.syncStatusController.getStatus() === 'waiting_for_host' &&
                    this.session.isPausedForOrderSync()
                ) {
                    this.waitingForHostUiPollStreak += 1;
                } else {
                    this.waitingForHostUiPollStreak = 0;
                }
                this.emit('waiting-for-host-poll-streak', { streak: this.waitingForHostUiPollStreak });

                if (
                    !this.isRecovering &&
                    this.syncStatusController.getStatus() === 'waiting_for_host' &&
                    this.waitingForHostUiPollStreak >= BATTLE_NET_WAITING_HOST_UI_FORCE_RESYNC_POLLS
                ) {
                    logToLobbyLogBattleSync({
                        lobbyClient: this.api as unknown as LobbyClient,
                        lobbyId: this.lobbyId,
                        playerId: this.playerId,
                        tick: this.session.getEngineTick(),
                        severity: 'warn',
                        gameId: this.gameId,
                        message: 'waiting_for_host stall threshold — forcing full resync',
                        context: {
                            polls: this.waitingForHostUiPollStreak,
                            threshold: BATTLE_NET_WAITING_HOST_UI_FORCE_RESYNC_POLLS,
                        },
                    });
                    this.waitingForHostUiPollStreak = 0;
                    this.requestResync('waiting-for-host-stall');
                }
            }

            this.publishSyncDebugBridge(hb);
            traceBattleHeartbeatLine('pollOnce complete', {
                traceInstanceId: this.heartbeatTraceInstanceId,
                pollSeq,
                pollSource,
                engineTickAfter: this.session.getEngineTick(),
            });
        } finally {
            this.isPolling = false;
        }
    }

    private async fetchAndApplyNewOrders(
        untilTick: number,
        opts?: { rescanOrdersFromTickZero?: boolean; serverOrderRecordCount?: number | null },
    ): Promise<void> {
        const rescan = opts?.rescanOrdersFromTickZero === true;
        if (!rescan && untilTick < this.lastOrderFetchSince) {
            return;
        }
        const sinceTick = rescan ? 0 : this.lastOrderFetchSince;
        const range = await this.api.getBattleOrdersRange(this.lobbyId, this.gameId, {
            playerId: this.playerId,
            sinceTick: sinceTick > 0 ? sinceTick : undefined,
            untilTick: untilTick >= 0 ? untilTick : undefined,
        });
        const toApply: Array<{ atTick: number; order: BattleOrder }> = [];
        for (const rec of range.orders) {
            if (rec.playerId === this.playerId) {
                this.serverRangeConfirmedOurOrderHashes.add(rec.idHash);
                this.ourOrdersAwaitingServerRange.delete(rec.idHash);
            }
            if (this.appliedOrderIdHashes.has(rec.idHash)) {
                continue;
            }
            this.appliedOrderIdHashes.add(rec.idHash);
            toApply.push({ atTick: rec.atTick, order: rec.order });
        }
        if (toApply.length > 0) {
            this.session.applyRemoteOrders(toApply);
            this.emit('orders-applied', { count: toApply.length, source: 'poll' });
        }
        const srvCount = opts?.serverOrderRecordCount;
        if (srvCount != null) {
            this.lastSeenOrdersRecordCount = srvCount;
        }
        if (!rescan && untilTick >= 0) {
            // In legacy heartbeat mode (no ordersRecordCount), a poll can race an append:
            // heartbeat advertises tip tick N, range fetch returns empty, and the order row
            // is written moments later at the same tick N. Only advance the cursor to what we
            // actually observed so late-arriving rows at the same tick are still discoverable.
            const maxObservedAtTick = range.orders.reduce<number | null>((maxTick, rec) => {
                if (typeof rec.atTick !== 'number') {
                    return maxTick;
                }
                return maxTick == null ? rec.atTick : Math.max(maxTick, rec.atTick);
            }, null);
            if (maxObservedAtTick != null) {
                this.lastOrderFetchSince = maxObservedAtTick + 1;
            }
        } else if (rescan && untilTick >= 0) {
            const maxObservedAtTick = range.orders.reduce<number | null>((maxTick, rec) => {
                if (typeof rec.atTick !== 'number') {
                    return maxTick;
                }
                return maxTick == null ? rec.atTick : Math.max(maxTick, rec.atTick);
            }, null);
            if (maxObservedAtTick != null) {
                this.lastOrderFetchSince = maxObservedAtTick + 1;
            }
        }
    }

    private deferLocalOrder(
        idHash: string,
        atTick: number,
        order: BattleOrder,
        appliedLocally: boolean,
    ): void {
        this.orderQueue.deferLocalOrder(idHash, atTick, order, appliedLocally);
    }

    private applyDeferredRowLocallyIfNeeded(item: {
        idHash: string;
        atTick: number;
        order: BattleOrder;
        appliedLocally: boolean;
    }): void {
        this.orderQueue.applyDeferredRowLocallyIfNeeded(item);
    }

    private async persistOrder(
        order: BattleOrder,
        atTick: number,
        idHash: string,
        allowDeferralOnHostLag: boolean,
    ): Promise<void> {
        let res: {
            accepted: boolean;
            idHash: string;
            rejectedReason?: string;
            maxAllowedTick?: number;
            minAllowedTick?: number;
            hostTick?: number;
            hostFingerprint?: string | null;
        };
        logToLobbyLogBattleSync({
            lobbyClient: this.api as unknown as LobbyClient,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            tick: atTick,
            severity: 'info',
            gameId: this.gameId,
            message: 'appendBattleOrder POST attempt',
            context: {
                idHash,
                atTick,
                unitId: order.unitId,
                abilityId: order.abilityId,
                allowDeferralOnHostLag,
                isHost: this.isHost,
                lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                localEngineTick: this.session.getEngineTick(),
                localLatestFingerprintTick: this.session.getLatestFingerprint()?.tick ?? null,
                isPausedForOrderSync: this.session.isPausedForOrderSync(),
                queuedDeferredBeforePost: this.deferredLocalOrders.length,
            },
        });
        try {
            res = await this.api.appendBattleOrder(this.lobbyId, this.gameId, {
                playerId: this.playerId,
                atTick,
                order,
                idHash,
            });
        } catch (_error) {
            const err = _error instanceof Error ? _error.message : String(_error);
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'appendBattleOrder POST failed before response',
                context: {
                    idHash,
                    atTick,
                    unitId: order.unitId,
                    abilityId: order.abilityId,
                    error: err,
                    isHost: this.isHost,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    localEngineTick: this.session.getEngineTick(),
                    localLatestFingerprintTick: this.session.getLatestFingerprint()?.tick ?? null,
                    isPausedForOrderSync: this.session.isPausedForOrderSync(),
                    queuedDeferredBeforeEnqueue: this.deferredLocalOrders.length,
                },
            });
            this.deferLocalOrder(idHash, atTick, order, true);
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'appendBattleOrder network error; deferred for retry',
                context: { abilityId: order.abilityId, unitId: order.unitId },
            });
            this.emitHostCatchupWaitState();
            return;
        }
        this.updateHeartbeatFromAppendResponse(res);
        logToLobbyLogBattleSync({
            lobbyClient: this.api as unknown as LobbyClient,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            tick: atTick,
            severity: res.accepted ? 'info' : 'warn',
            gameId: this.gameId,
            message: res.accepted ? 'appendBattleOrder POST response accepted' : 'appendBattleOrder POST response not accepted',
            context: {
                idHash,
                atTick,
                unitId: order.unitId,
                abilityId: order.abilityId,
                accepted: res.accepted,
                rejectedReason: res.rejectedReason ?? null,
                maxAllowedTick: res.maxAllowedTick ?? null,
                minAllowedTick: res.minAllowedTick ?? null,
                serverHostTickAtAppend: res.hostTick ?? null,
                serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
                queuedDeferredAtResponse: this.deferredLocalOrders.length,
            },
        });
        this.appliedOrderIdHashes.add(res.idHash || idHash);
        if (res.accepted) {
            this.deferredLocalOrders = this.deferredLocalOrders.filter((item) => item.idHash !== idHash);
            if (!this.isHost) {
                const t =
                    typeof res.hostTick === 'number' && !Number.isNaN(res.hostTick)
                        ? res.hostTick
                        : this.latestHeartbeatHostTick;
                this.previouslySyncedAtTick = t;
                this.hostAnchorWaitStartedAtMs = null;
                this.hostAnchorResyncEmittedForCurrentStall = false;
            }
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'log',
                gameId: this.gameId,
                message: 'appendBattleOrder accepted',
                context: {
                    abilityId: order.abilityId,
                    unitId: order.unitId,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    serverHostTickAtAppend: res.hostTick ?? null,
                    serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
                },
            });
            return;
        }
        if (allowDeferralOnHostLag && res.rejectedReason === 'tick_ahead_of_host') {
            this.deferLocalOrder(idHash, atTick, order, true);
            if (this.session.isPausedForOrderSync()) {
                this.syncStatusController.presentWaitingForHostOptimisticQueued();
            }
            this.emitHostCatchupWaitState();
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'appendBattleOrder rejected tick_ahead_of_host; deferred client POST',
                context: {
                    maxAllowedTick: res.maxAllowedTick,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    serverHostTickAtAppend: res.hostTick ?? null,
                    serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
                },
            });
            return;
        }
        if (!allowDeferralOnHostLag && res.rejectedReason === 'tick_ahead_of_host') {
            logToLobbyLogBattleSync({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'forced deferred POST retry still ahead of host; keeping order queued',
                context: {
                    idHash,
                    maxAllowedTick: res.maxAllowedTick ?? null,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    latestHeartbeatPausedAtTick: this.latestHeartbeatPausedAtTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    serverHostTickAtAppend: res.hostTick ?? null,
                    serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
                },
            });
            this.emitHostCatchupWaitState();
            return;
        }
        if (res.rejectedReason === 'tick_in_past') {
            this.emitRejectedOrderSyncDetail(res.rejectedReason);
            this.deferredLocalOrders = this.deferredLocalOrders.filter((item) => item.idHash !== idHash);
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: 'appendBattleOrder rejected tick_in_past; requesting resync',
                context: {
                    minAllowedTick: res.minAllowedTick,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    serverHostTickAtAppend: res.hostTick ?? null,
                    serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
                },
            });
            this.requestResync('tick-in-past');
            return;
        }
        if (res.rejectedReason === 'not_unit_owner' || res.rejectedReason === 'unknown_unit') {
            this.emitRejectedOrderSyncDetail(res.rejectedReason);
            this.deferredLocalOrders = this.deferredLocalOrders.filter((item) => item.idHash !== idHash);
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: atTick,
                severity: 'warn',
                gameId: this.gameId,
                message: `appendBattleOrder rejected ${res.rejectedReason}; requesting resync`,
                context: { unitId: order.unitId },
            });
            this.requestResync(res.rejectedReason === 'not_unit_owner' ? 'not-unit-owner' : 'unknown-unit');
            return;
        }
        // Duplicate/other non-ahead responses mean the server already has this order or
        // cannot use it; keep local optimistic state transient and drop the deferred row.
        this.deferredLocalOrders = this.deferredLocalOrders.filter((item) => item.idHash !== idHash);
        logToLobbyLogBattleSync({
            lobbyClient: this.api as unknown as LobbyClient,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            tick: atTick,
            severity: 'warn',
            gameId: this.gameId,
            message:
                'appendBattleOrder HTTP 200 but not appended — no rejectedReason (usually duplicate idHash on server)',
            context: {
                idHash,
                abilityId: order.abilityId,
                unitId: order.unitId,
                lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                serverHostTickAtAppend: res.hostTick ?? null,
                serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
                note: 'If server duplicate is a false positive, investigate 32-bit idHash collisions.',
            },
        });
    }

    private get latestHeartbeatHostTick(): number {
        return this.heartbeatState.getLatestHostTick();
    }

    private get latestHeartbeatPausedAtTick(): number | null {
        return this.heartbeatState.getLatestPausedAtTick();
    }

    private set latestHeartbeatPausedAtTick(value: number | null) {
        this.heartbeatState.setLatestPausedAtTick(value);
    }

    private updateLastSeenHeartbeat(hostTick: number): void {
        this.heartbeatState.updateLastSeenHeartbeat(hostTick);
    }

    private updateHeartbeatFromAppendResponse(res: { hostTick?: number; hostFingerprint?: string | null }): void {
        this.heartbeatState.updateHeartbeatFromAppendResponse(res);
    }

    private getLastHeartbeatAgeMs(): number | null {
        return this.heartbeatState.getLastHeartbeatAgeMs();
    }

    private async flushDeferredOrdersUpTo(hostTick: number): Promise<void> {
        if (this.deferredLocalOrders.length === 0) {
            return;
        }
        this.deferredLocalOrders.sort((a, b) => a.atTick - b.atTick);
        const pending = [...this.deferredLocalOrders];
        const maxEligibleAtTick = hostTick + 1;
        const engineTick = this.session.getEngineTick();
        let flushAttempted = 0;
        for (const item of pending) {
            if (item.atTick > maxEligibleAtTick) {
                const blockedCount = pending.length - flushAttempted;
                const head = item;
                if (flushAttempted === 0) {
                    const whyFlushSkipped =
                        `no deferred POST this poll: earliest queued row is atTick=${head.atTick} but heartbeat hostTick=${hostTick} only allows POST for atTick<=${maxEligibleAtTick}`;
                    console.info('[BattleNet] flushDeferredOrdersUpTo skipped posting (all rows blocked)', {
                        why: whyFlushSkipped,
                        lobbyId: this.lobbyId,
                        gameId: this.gameId,
                        heartbeatHostTick: hostTick,
                        maxEligibleAtTick,
                        queuedCount: pending.length,
                        deferredHeadIdHash: head.idHash,
                    });
                    logToLobbyLogBattleSync({
                        lobbyClient: this.api as unknown as LobbyClient,
                        lobbyId: this.lobbyId,
                        playerId: this.playerId,
                        tick: engineTick,
                        severity: 'info',
                        gameId: this.gameId,
                        message: 'flushDeferredOrdersUpTo skipped: deferred atTick ahead of heartbeat host tail',
                        context: {
                            whyFlushSkipped,
                            heartbeatHostTick: hostTick,
                            maxEligibleAtTick,
                            queuedDeferredCount: pending.length,
                            earliestDeferredAtTick: head.atTick,
                            earliestDeferredIdHash: head.idHash,
                        },
                    });
                    logToLobbyLog({
                        lobbyClient: this.api as unknown as LobbyClient,
                        lobbyId: this.lobbyId,
                        playerId: this.playerId,
                        tick: engineTick,
                        severity: 'info',
                        gameId: this.gameId,
                        message: 'flushDeferredOrdersUpTo skipped (host tail)',
                        context: {
                            why: whyFlushSkipped,
                            heartbeatHostTick: hostTick,
                            queuedCount: pending.length,
                        },
                    });
                } else if (blockedCount > 0) {
                    const whyFlushSkippedPartial =
                        `posted ${flushAttempted} deferred row(s); ${blockedCount} still blocked (need atTick<=${maxEligibleAtTick}, next atTick=${head.atTick})`;
                    console.info('[BattleNet] flushDeferredOrdersUpTo left rows blocked after partial flush', {
                        why: whyFlushSkippedPartial,
                        lobbyId: this.lobbyId,
                        gameId: this.gameId,
                        heartbeatHostTick: hostTick,
                        maxEligibleAtTick,
                        postedCount: flushAttempted,
                        blockedCount,
                        nextBlockedAtTick: head.atTick,
                    });
                    logToLobbyLogBattleSync({
                        lobbyClient: this.api as unknown as LobbyClient,
                        lobbyId: this.lobbyId,
                        playerId: this.playerId,
                        tick: engineTick,
                        severity: 'info',
                        gameId: this.gameId,
                        message: 'flushDeferredOrdersUpTo partial: later deferred rows still ahead of host tail',
                        context: {
                            whyFlushSkipped: whyFlushSkippedPartial,
                            heartbeatHostTick: hostTick,
                            maxEligibleAtTick,
                            postedDeferredCount: flushAttempted,
                            stillQueuedCount: blockedCount,
                            nextBlockedAtTick: head.atTick,
                            nextBlockedIdHash: head.idHash,
                        },
                    });
                    logToLobbyLog({
                        lobbyClient: this.api as unknown as LobbyClient,
                        lobbyId: this.lobbyId,
                        playerId: this.playerId,
                        tick: engineTick,
                        severity: 'info',
                        gameId: this.gameId,
                        message: 'flushDeferredOrdersUpTo partial flush; rows remain queued',
                        context: {
                            why: whyFlushSkippedPartial,
                            heartbeatHostTick: hostTick,
                            postedCount: flushAttempted,
                            blockedCount,
                        },
                    });
                }
                break;
            }
            this.applyDeferredRowLocallyIfNeeded(item);
            await this.persistOrder(item.order, item.atTick, item.idHash, true);
            flushAttempted++;
        }
    }

    private async maybeForceFlushDeferredOrder(hostTick: number): Promise<void> {
        if (this.deferredLocalOrders.length === 0) {
            return;
        }
        if (!this.session.isPausedForOrderSync()) {
            const why =
                `Watchdog POST force-retry arms only during an engine parallel order batch (${this.engineOrderSyncPauseSummary()}). ` +
                'Here the sim is not in that pause—deferred HTTP row(s) remain until hostTick catches up (flushDeferredOrdersUpTo) or a new waitingForOrders batch starts.';
            this.logDeferredWatchdogBranch(
                'skipped_not_paused_for_order_sync',
                hostTick,
                {},
                why,
            );
            logToLobbyLog({
                lobbyClient: this.api as unknown as LobbyClient,
                lobbyId: this.lobbyId,
                playerId: this.playerId,
                tick: this.session.getEngineTick(),
                severity: 'info',
                gameId: this.gameId,
                message: 'deferred order watchdog skipped — engine not paused for order sync while deferred POST queued',
                context: {
                    why,
                    branch: 'skipped_not_paused_for_order_sync',
                    hostTick,
                    lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
                    queuedDeferredCount: this.deferredLocalOrders.length,
                    latestHeartbeatPausedAtTick: this.latestHeartbeatPausedAtTick,
                    stuckHeartbeats: this.hostCatchupHeartbeatStreak,
                    localEngineTick: this.session.getEngineTick(),
                    lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
                    waitingForOrdersBatch: this.session.getWaitingForOrdersBatch(),
                    engineOrderSyncPauseSummary: this.engineOrderSyncPauseSummary(),
                },
            });
            return;
        }
        if (this.hostCatchupHeartbeatStreak < BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS) {
            this.logDeferredWatchdogBranch(
                'skipped_streak_below_threshold',
                hostTick,
                {
                    threshold: BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS,
                },
                `${this.engineOrderSyncPauseSummary()}. Deferred HTTP POST still queued; only ${this.hostCatchupHeartbeatStreak} heartbeat poll(s) saw paused+blocking (need ${BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS}) before forcing POST retry.`,
            );
            return;
        }
        if (this.hostCatchupHeartbeatStreak % BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS !== 0) {
            this.logDeferredWatchdogBranch(
                'skipped_not_on_retry_multiple',
                hostTick,
                {
                    threshold: BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS,
                },
                `${this.engineOrderSyncPauseSummary()}. Deferred HTTP queued; force-retry aligns to every ${BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS} consecutive paused+blocking heartbeat polls.`,
            );
            return;
        }
        const oldestDeferred = [...this.deferredLocalOrders].sort((a, b) => a.atTick - b.atTick)[0];
        if (oldestDeferred == null) {
            this.logDeferredWatchdogBranch(
                'skipped_oldest_missing',
                hostTick,
                {},
                'Deferred queue reported non-empty but sorted head was missing (unexpected).',
            );
            return;
        }
        this.logDeferredWatchdogBranch(
            'forcing_retry',
            hostTick,
            {
                idHash: oldestDeferred.idHash,
                atTick: oldestDeferred.atTick,
            },
            `${this.engineOrderSyncPauseSummary()}. Stalled heartbeat threshold met — re-POST oldest deferred HTTP row.`,
        );
        logToLobbyLogBattleSync({
            lobbyClient: this.api as unknown as LobbyClient,
            lobbyId: this.lobbyId,
            playerId: this.playerId,
            tick: oldestDeferred.atTick,
            severity: 'warn',
            gameId: this.gameId,
            message: 'deferred order watchdog forcing POST retry while paused',
            context: {
                idHash: oldestDeferred.idHash,
                atTick: oldestDeferred.atTick,
                hostTick,
                stuckHeartbeats: this.hostCatchupHeartbeatStreak,
                queuedDeferredCount: this.deferredLocalOrders.length,
                latestHeartbeatPausedAtTick: this.latestHeartbeatPausedAtTick,
                waitingForOrdersBatch: this.session.getWaitingForOrdersBatch(),
                engineOrderSyncPauseSummary: this.engineOrderSyncPauseSummary(),
            },
        });
        this.applyDeferredRowLocallyIfNeeded(oldestDeferred);
        await this.persistOrder(oldestDeferred.order, oldestDeferred.atTick, oldestDeferred.idHash, false);
    }

    /**
     * Human-readable snapshot of {@link GameEngine.waitingForOrders} for sync logs.
     * That pause is raised when the tick loop finds player units that can act but still need orders
     * for the parallel batch (see `GameEngine.collectParallelWaiters` / `commitDeferredOrderPauseAfterCompletedTick`).
     */
    private engineOrderSyncPauseSummary(): string {
        return this.orderQueue.engineOrderSyncPauseSummary();
    }

    private logDeferredWatchdogBranch(
        branch: string,
        hostTick: number,
        extraContext: Record<string, unknown>,
        why: string,
    ): void {
        this.orderQueue.logDeferredWatchdogBranch(branch, hostTick, extraContext, why);
    }

    private emitHostCatchupWaitState(): void {
        this.orderQueue.emitHostCatchupWaitState();
    }

    /**
     * Clears optimistic order tracking and non-host heartbeat/reconciler hint state at desync
     * recovery entry (matches the pre-split `runDesyncRecovery` preamble). Deferred POST rows
     * are preserved — see {@link OrderQueueController.resetLocalOptimisticOrdersOnResync}.
     */
    resetForDesyncRecoveryEntry(): void {
        this.orderQueue.resetLocalOptimisticOrdersOnResync();
        this.resetNonHostAheadStreak();
        this.previouslySyncedAtTick = null;
        this.heartbeatState.resetMaterialTracking();
        this.syncReconciler.setLastNonHostHbPausePlane(null);
        this.clearHostAnchorWaitState();
        this.emitBlockingHostPausePlane(false);
        this.waitingForHostUiPollStreak = 0;
        this.emit('waiting-for-host-poll-streak', { streak: 0 });
        this.emitHostCatchupWaitState();
    }

    private resetNonHostAheadStreak(): void {
        this.syncReconciler.resetNonHostAheadStreak();
    }

    private clearHostAnchorWaitState(): void {
        this.hostAnchorWait.clearHostAnchorWaitState();
    }

    notePreviouslySyncedAnchorTick(hostAlignedTick: number): void {
        this.hostAnchorWait.notePreviouslySyncedAnchorTick(hostAlignedTick);
    }

    private emitBlockingHostPausePlane(blocking: boolean): void {
        this.syncReconciler.emitBlockingHostPausePlane(blocking);
    }

    private refreshHostAnchorWaitAndBlocking(engineTick: number, hb: BattleNetEventMap['heartbeat']): void {
        this.hostAnchorWait.refreshHostAnchorWaitAndBlocking(engineTick, hb);
    }

    private async flushFingerprints(): Promise<void> {
        await this.fingerprintBatcher.flush();
    }

    /**
     * Ensures at least {@link HEARTBEAT_POLL_INTERVAL_MS} between battle heartbeat GETs across
     * the poll loop, recovery, and alignment helpers (serialized so concurrent callers cannot bypass).
     */
    private getBattleHeartbeatThrottled(opts?: {
        gameTick?: number;
        bypassThrottle?: boolean;
        tracePhase?: string;
    }): Promise<BattleHeartbeatApiResult> {
        return this.heartbeatHttp.getBattleHeartbeatThrottled(opts);
    }

    private emitRejectedOrderSyncDetail(rejectedReason?: string): void {
        this.syncStatusController.emitRejectedOrderSyncDetail(rejectedReason);
    }

    async tryBootstrapFromLatestCheckpoint(): Promise<boolean> {
        return this.recovery.tryBootstrapFromLatestCheckpoint();
    }

    async recoverFromLobbyInitialFingerprintMismatch(): Promise<boolean> {
        return this.recovery.recoverFromLobbyInitialFingerprintMismatch();
    }

    private async runDesyncRecovery(reason: string): Promise<void> {
        return this.recovery.runDesyncRecovery(reason);
    }

    private emit<K extends keyof BattleNetEventMap>(event: K, payload: BattleNetEventMap[K]): void {
        this.events.emit(event, payload);
    }

    private publishSyncDebugBridge(hb: BattleNetEventMap['heartbeat']): void {
        this.pollLoop.publishSyncDebugBridge(hb);
    }
}

export class HostBattleNet extends BattleNet {
    constructor(args: BattleNetFactoryArgs) {
        super({ ...args, isHost: true });
    }
}

export class ClientBattleNet extends BattleNet {
    constructor(args: BattleNetFactoryArgs) {
        super({ ...args, isHost: false });
    }
}

export function createBattleNet(args: BattleNetFactoryArgs & { isHost: boolean }): BattleNet {
    return args.isHost ? new HostBattleNet(args) : new ClientBattleNet(args);
}
