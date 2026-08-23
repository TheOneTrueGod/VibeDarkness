import type { LobbyClient } from '../../../../LobbyClient';
import { traceBattleHeartbeatLine } from '../../../../battleHeartbeatTrace';
import { logToLobbyLog, logToLobbyLogBattleSync } from '../../../../lobbyLog';
import type { BattleOrder, SerializedGameState } from '../types';
import { hashOrderId } from './helpers/orderHashing';
import { summarizeRemoteWireRowsForLog } from './helpers/orderWireLogSummary';
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
	BATTLE_NET_WAITING_HOST_PAUSED_STALL_MS,
	BATTLE_NET_BEHIND_HOST_TICKS_THRESHOLD,
	BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS,
	BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_GAP,
	BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_POLLS,
	BATTLE_NET_STUCK_PAUSED_RESYNC_POLLS,
	ITS_PRE_ACTION_POLL_TIMEOUT_MS,
	BATTLE_NET_STRUCTURAL_DIVERGENCE_GRACE_MS,
} from './constants';
import type {
	ApplyRemoteOrdersResult,
	BattleSessionHandle,
	BattleNetEventMap,
	BattleNetListener as Listener,
	BattleNetUnsub as Unsub,
	BattleApi,
	BattleNetArgs,
	BattleNetPollOnceOptions,
	BattleHeartbeatApiResult,
	BattleNetFactoryArgs,
	SubmitOrderOptions,
} from './types';

export {
	BATTLE_NET_T1_WAITING_POLLS,
	BATTLE_NET_T2_RESYNC_POLLS,
	BATTLE_NET_WAITING_HOST_UI_SHOW_POLLS,
	BATTLE_NET_WAITING_HOST_UI_FORCE_RESYNC_POLLS,
	BATTLE_NET_WAITING_HOST_PAUSED_STALL_MS,
	HOST_ANCHOR_WAIT_SHOW_MS,
	HOST_ANCHOR_RESYNC_MS,
	BATTLE_NET_BEHIND_HOST_TICKS_THRESHOLD,
	BATTLE_NET_MAX_DEFERRED_ORDERS,
	BATTLE_NET_DEFERRED_FORCE_FLUSH_POLLS,
	BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_GAP,
	BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_POLLS,
	BATTLE_NET_STUCK_PAUSED_RESYNC_POLLS,
	BATTLE_NET_STRUCTURAL_DIVERGENCE_GRACE_MS,
} from './constants';
export type {
	ApplyRemoteOrdersResult,
	BattleSessionHandle,
	BattleNetSyncTerminalStatus,
	BattleNetPollOnceOptions,
	BattleNetFactoryArgs,
	LocalSyncAnomalyContext,
	RemoteOrderWireRow,
	SubmitOrderOptions,
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

	hasDeferredOrderFor(unitId: string, atTick: number): boolean {
		return this.orderQueue.hasDeferredOrderFor(unitId, atTick);
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

	/**
	 * Non-host: first `(hostTick, localTick)` snapshot when `localTick > hostTick` (optimistic playahead window),
	 * plus wall time when that window opened (structural-divergence grace).
	 * Cleared when the tail catches up, alignment is proved, or desync recovery runs.
	 */
	private nonHostOptimisticPlayaheadAnchor: {
		hostTick: number;
		localTick: number;
		startedAtMs: number;
	} | null = null;
	/** Non-host: wall-clock stall detection while `waiting_for_host` + paused for parallel orders. */
	private waitingForHostPausedStallSinceMs: number | null = null;
	private waitingForHostPausedStallMaterialKey: string | null = null;
	/** One-shot dedup for {@link maybeImmediateAlignWhenHostExpectsLocalPlayer} skip logs (500 ms poll loop). */
	private immediateAlignSkipLogKey: string | null = null;
	/**
	 * One-shot dedup for {@link maybeLogPausePlaneStructuralDivergence}: the host `orderBatchAtTick`
	 * already logged for, so an unchanged pause plane does not re-log every poll. Cleared on recovery entry.
	 */
	private structuralDivergenceLoggedForBatch: number | null = null;

	/**
	 * Non-host: consecutive polls where the host advanced (material change or new order records)
	 * while we're paused for parallel orders AND `hostTick - engineTick` exceeds
	 * {@link BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_GAP}. When this reaches
	 * {@link BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_POLLS}, a full order rescan is forced. After the
	 * rescan, if the streak keeps growing for {@link BATTLE_NET_STUCK_PAUSED_RESYNC_POLLS} more
	 * polls without local engine progress, escalate to `requestResync('stuck-paused-host-ahead')`.
	 */
	private stuckPausedHostAheadPollStreak = 0;
	/** Last engineTick observed by the stuck-paused detector (reset when the streak resets). */
	private stuckPausedHostAheadPrevEngineTick: number | null = null;
	/** True once we've forced a catch-up rescan for the current stall (latched until streak resets). */
	private stuckPausedHostAheadRescanDone = false;
	/** Polls observed after rescan still meeting the stuck conditions (drives resync escalation). */
	private stuckPausedHostAheadPostRescanPolls = 0;
	/**
	 * Non-host: after observing post-merge `engineTick < hostTick` while paused for parallel orders,
	 * keep `includePastApplied` on subsequent heartbeats until catch-up / recovery clears this.
	 */
	private nonHostPastAppliedHeartbeatLatch = false;

	/**
	 * Session {@link BattleSessionHandle.applyRemoteOrders} is authoritative for dedupe; merge its
	 * outcome into {@link appliedOrderIdHashes} so we never orphan hashes for rows the session skipped.
	 */
	private registerAppliedOrderHashesFromRemoteApplyResult(result: ApplyRemoteOrdersResult): void {
		for (const k of result.newlyAppliedKeys) {
			this.appliedOrderIdHashes.add(k);
		}
		for (const k of result.skippedKeys) {
			this.appliedOrderIdHashes.add(k);
		}
	}

	/**
	 * True when {@link submitOrder} is not blocked by recovery or post-resync ack gates.
	 * Shared with interactive targeting in-place commit (`wouldCommitInPlace`).
	 */
	isOrderSubmitPathAvailable(): boolean {
		return !this.isRecovering && !this.syncStatusController.isAwaitingUserAck();
	}

	/**
	 * True when `atTick` is still a valid server order batch (strictly after host last-completed,
	 * and not behind heartbeat `orderBatchAtTick` when known). Lobby F6E500.
	 */
	isOrderBatchTickSubmittable(atTick: number): boolean {
		const hostTick = this.latestHeartbeatHostTick;
		if (hostTick >= 0 && atTick <= hostTick) {
			return false;
		}
		const orderBatch = this.latestHeartbeatPausedAtTick;
		if (orderBatch != null && atTick < orderBatch) {
			return false;
		}
		return true;
	}

	/** Heartbeat parallel order batch (`orderBatchAtTick` / `pausedAtTick` when host paused). */
	getHeartbeatOrderBatchAtTick(): number | null {
		const batch = this.latestHeartbeatPausedAtTick;
		return batch != null && !Number.isNaN(batch) ? batch : null;
	}

	/** Latest heartbeat host completed tick (non-host catch-up / order-apply gates). */
	getLatestHeartbeatHostTick(): number {
		return this.latestHeartbeatHostTick;
	}

	/**
	 * True when heartbeat does not list waiters, or lists this player.
	 * When the host pause plane only expects other players, local submit/ITS must not start.
	 */
	isLocalPlayerExpectedToAct(): boolean {
		const expecting = this.heartbeatState.getLatestExpectingFromPlayerIds();
		if (!Array.isArray(expecting) || expecting.length === 0) {
			return true;
		}
		return expecting.includes(this.playerId);
	}

	private registerSkipLocalApplyDedupe(idHash: string): void {
		if (this.appliedOrderIdHashes.has(idHash)) {
			return;
		}
		this.appliedOrderIdHashes.add(idHash);
		this.session.seedRemoteOrderDedupeKeys([idHash]);
	}

	async submitOrder(order: BattleOrder, atTick: number, opts?: SubmitOrderOptions): Promise<void> {
		const skipLocalApply = opts?.skipLocalApply === true;
		if (this.isRecovering) {
			const idHash = hashOrderId(this.playerId, atTick, order);
			const whyImmediateSubmitSkipped =
				'submitOrder deferred while recovery active (no immediate POST)';
			if (!this.appliedOrderIdHashes.has(idHash)) {
				if (!this.deferredLocalOrders.some((r) => r.idHash === idHash)) {
					if (skipLocalApply) {
						this.registerSkipLocalApplyDedupe(idHash);
					}
					this.deferLocalOrder(idHash, atTick, order, skipLocalApply);
				}
			}
			this.emitHostCatchupWaitState();
			console.warn('[BattleNet] submitOrder deferred while recovery active', {
				why: whyImmediateSubmitSkipped,
				lobbyId: this.lobbyId,
				gameId: this.gameId,
				atTick,
				unitId: order.unitId,
				abilityId: order.abilityId,
				idHash,
				skipLocalApply,
				queuedDeferredAfter: this.deferredLocalOrders.length,
			});
			logToLobbyLogBattleSync({
				lobbyClient: this.api as unknown as LobbyClient,
				lobbyId: this.lobbyId,
				playerId: this.playerId,
				tick: atTick,
				severity: 'warn',
				logType: 'desync',
				gameId: this.gameId,
				message: 'submitOrder deferred while recovery active (no immediate POST)',
				context: {
					whyImmediateSubmitSkipped,
					idHash,
					skipLocalApply,
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
				logType: 'desync',
				gameId: this.gameId,
				message: 'submitOrder deferred while recovery active (no immediate POST)',
				context: {
					why: whyImmediateSubmitSkipped,
					idHash,
					unitId: order.unitId,
					abilityId: order.abilityId,
				},
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

		// Stale pause-plane gate (lobby F6E500): never optimistically apply or POST an order
		// for a batch the host has already completed, or when we are not an expected waiter.
		if (!this.isHost && !this.isOrderBatchTickSubmittable(atTick)) {
			logToLobbyLogBattleSync({
				lobbyClient: this.api as unknown as LobbyClient,
				lobbyId: this.lobbyId,
				playerId: this.playerId,
				tick: atTick,
				severity: 'warn',
				logType: 'desync',
				gameId: this.gameId,
				message: 'submitOrder blocked: atTick stale vs host pause plane (no local apply / POST)',
				context: {
					atTick,
					lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
					latestHeartbeatPausedAtTick: this.latestHeartbeatPausedAtTick,
					abilityId: order.abilityId,
					unitId: order.unitId,
				},
			});
			this.emitRejectedOrderSyncDetail('tick_in_past');
			void this.softAlignAfterStaleOrderBatch('stale-order-batch');
			return;
		}
		if (!this.isHost && !this.isLocalPlayerExpectedToAct()) {
			logToLobbyLogBattleSync({
				lobbyClient: this.api as unknown as LobbyClient,
				lobbyId: this.lobbyId,
				playerId: this.playerId,
				tick: atTick,
				severity: 'info',
				gameId: this.gameId,
				message: 'submitOrder blocked: local player not in heartbeat expectingFromPlayerIds',
				context: {
					atTick,
					expectingFromPlayerIds: this.heartbeatState.getLatestExpectingFromPlayerIds(),
					abilityId: order.abilityId,
					unitId: order.unitId,
				},
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
			const heartbeatHostTick = this.latestHeartbeatHostTick;
			const orderBatchHeartbeat = this.latestHeartbeatPausedAtTick;
			const isPausedForOrderSync = this.session.isPausedForOrderSync();
			const pausedAtGate = orderBatchHeartbeat != null && atTick <= orderBatchHeartbeat;
			const hostSlackGate = atTick <= heartbeatHostTick + 2;
			// In-place ITS commit: engine is intentionally ahead of hostTick, but atTick is still the
			// mark batch (hostTick+1 / orderBatchAtTick) and must POST immediately — not queue behind
			// flushDeferredOrdersUpTo while the preview sim unpause runs (lobby 04B5B8).
			const inPlaceMarkBatchPost =
				skipLocalApply &&
				atTick <= heartbeatHostTick + 1 &&
				(pausedAtGate || (isPausedForOrderSync && hostSlackGate));
			if (!inPlaceMarkBatchPost) {
			if (this.appliedOrderIdHashes.has(idHash)) {
				return;
			}
			if (!this.deferredLocalOrders.some((r) => r.idHash === idHash)) {
				if (skipLocalApply) {
					this.registerSkipLocalApplyDedupe(idHash);
				}
				this.deferLocalOrder(idHash, atTick, order, skipLocalApply);
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
		}

		this.ourOrdersAwaitingServerRange.add(idHash);

		// Non-host: keep optimistic local apply *before* POST deferral gates (deferred submits must still
		// queue locally). Host defers local apply until after append so merge-applied cannot race pending JSONL.
		// In-place ITS commit passes skipLocalApply — engine already ran the turn during preview.
		if (!skipLocalApply && !this.appliedOrderIdHashes.has(idHash) && !this.isHost) {
			const applyResult = this.session.applyRemoteOrders([
				{ atTick, order, idHash, playerId: this.playerId },
			]);
			this.registerAppliedOrderHashesFromRemoteApplyResult(applyResult);
			this.appliedOrderIdHashes.add(idHash);
			this.emit('orders-applied', { count: applyResult.newlyAppliedKeys.length, source: 'submit' });
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

		if (skipLocalApply && !this.isHost) {
			this.registerSkipLocalApplyDedupe(idHash);
		}

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
				logType: 'debug',
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

		// Host: append to pending_orders.jsonl *before* local queueOrder + tryResumeParallel → merge-applied,
		// so merge never races ahead of the host's own pending row on disk (see mergeFinalizedPendingForBatch).
		if (this.isHost) {
			const appended = await this.persistOrder(order, atTick, idHash, true);
			if (appended) {
				this.applyLocalSubmitOrderAfterAppend(order, atTick, idHash, {
					localEngineTick,
					localLatestFingerprintTick,
					effectiveHostTickCandidate,
				});
			}
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

	/** {@link BattleNetContext.softAlignToHostPausePlane} */
	softAlignToHostPausePlane(reason: string): void {
		void this.softAlignAfterStaleOrderBatch(reason);
	}

	/**
	 * Soft recovery for a stale local order batch (lobby F6E500): reload the latest host
	 * checkpoint and replay orders without the full desync-recovery UI path, when the local
	 * sim still agrees with the host at `hostTick`. Falls back to {@link requestResync} if
	 * bootstrap fails or fingerprints still disagree.
	 */
	private async softAlignAfterStaleOrderBatch(reason: string): Promise<void> {
		if (this.isRecovering) {
			return;
		}
		this.recovery.setIsRecovering(true);
		try {
			const hostTick = this.latestHeartbeatHostTick;
			const hostFp = this.heartbeatState.getLatestHostFingerprint();
			logToLobbyLogBattleSync({
				lobbyClient: this.api as unknown as LobbyClient,
				lobbyId: this.lobbyId,
				playerId: this.playerId,
				tick: this.session.getEngineTick(),
				severity: 'info',
				logType: 'desync',
				gameId: this.gameId,
				message: 'softAlignAfterStaleOrderBatch: bootstrap from latest checkpoint',
				context: {
					reason,
					hostTick,
					hostFingerprintHead: hostFp?.slice(0, 12) ?? null,
					orderBatchAtTick: this.latestHeartbeatPausedAtTick,
					expectingFromPlayerIds: this.heartbeatState.getLatestExpectingFromPlayerIds(),
				},
			});
			const ok = await this.tryBootstrapFromLatestCheckpoint();
			if (!ok) {
				this.recovery.setIsRecovering(false);
				this.requestResync(reason);
				return;
			}
			await this.forceCatchupOrderRescan(hostTick, null);
			const row =
				hostTick >= 0 ? this.session.getFingerprintRange(hostTick, hostTick)[0] : null;
			if (hostFp != null && row != null && row.fp !== hostFp) {
				this.recovery.setIsRecovering(false);
				this.requestResync(reason);
				return;
			}
			if (this.session.isPausedForOrderSync()) {
				this.syncStatusController.setStatus(
					'waiting_for_host',
					'Local order batch was stale; aligned to host pause plane.',
				);
			} else {
				this.syncStatusController.setStatus('synced');
			}
			this.emitHostCatchupWaitState();
			this.emitBlockingHostPausePlane(false);
		} catch (err) {
			console.error('[BattleNet] softAlignAfterStaleOrderBatch failed', err);
			this.recovery.setIsRecovering(false);
			this.requestResync(reason);
			return;
		}
		this.recovery.setIsRecovering(false);
	}

	queueFingerprint(tick: number, fp: string, paused: boolean, adminReason?: string): void {
		this.fingerprintBatcher.queueFingerprint(tick, fp, paused, adminReason);
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

	/**
	 * Host-only: persist an order that already ran locally (in-place sequential targeting commit).
	 * Appends to `pending_orders` and merges to applied without {@link applyLocalSubmitOrderAfterAppend}
	 * — the engine state already reflects the turn.
	 */
	async persistCommittedOrder(order: BattleOrder, atTick: number): Promise<boolean> {
		if (!this.isHost) return false;
		if (this.isRecovering) return false;
		if (this.syncStatusController.isAwaitingUserAck()) return false;

		const idHash = hashOrderId(this.playerId, atTick, order);
		const appended = await this.persistOrder(order, atTick, idHash, true);
		if (!appended) return false;

		return this.mergeAppliedOrdersForBatch(atTick);
	}

	/** Clears the post-recovery "Continue" UX gate (see {@link BATTLE_RESYNC_PAUSE_SIM_FOR_RESYNC_ACK} in `global_constants.js`). */
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

	/**
	 * Best-effort pull of remote orders before ITS reset/replay/commit. Reuses {@link pollOnce}
	 * (rows route to the ITS hold map while a preview is active). Never throws; resolves after
	 * {@link ITS_PRE_ACTION_POLL_TIMEOUT_MS} even on network failure or concurrent poll.
	 */
	async refreshRemoteOrdersForTargetingPreview(): Promise<void> {
		const deadline = Date.now() + ITS_PRE_ACTION_POLL_TIMEOUT_MS;
		const pollWaitSliceMs = 25;

		try {
			while (this.isPolling && Date.now() < deadline) {
				await new Promise<void>((resolve) => {
					setTimeout(resolve, pollWaitSliceMs);
				});
			}

			if (this.isRecovering || this.isPolling) {
				return;
			}

			const remainingMs = Math.max(0, deadline - Date.now());
			await Promise.race([
				this.pollOnce({ pollSource: 'its-refresh', forceHttp: true }),
				new Promise<void>((resolve) => {
					setTimeout(resolve, remainingMs);
				}),
			]);
		} catch {
			// Best-effort — Reset/Replay/commit must not hang on network errors.
		}
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
			let engineTick = this.session.getEngineTick();
			const latestHostTail = this.latestHeartbeatHostTick;
			const includePastApplied =
				!this.isHost &&
				(this.nonHostPastAppliedHeartbeatLatch ||
					engineTick < latestHostTail ||
					(latestHostTail === 0 && engineTick > 0));

			const hbRaw = await this.getBattleHeartbeatThrottled({
				gameTick: engineTick,
				includePastApplied,
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
				includePastApplied,
			});
			if (!this.isHost) {
				this.drainAndApplyStagedRemoteRows(
					typeof hbRaw.hostTick === 'number' ? hbRaw.hostTick : this.latestHeartbeatHostTick,
				);
			}
			this.applyHeartbeatPastAppliedOrders(hbRaw);
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
				hostFingerprintAdminReason: typeof hbRaw.hostFingerprintAdminReason === 'string' ? hbRaw.hostFingerprintAdminReason : null,
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
				requestedGameTick:
					typeof hbRaw.requestedGameTick === 'number'
						? hbRaw.requestedGameTick
						: hbRaw.gameTick ?? null,
				requestedGameHash:
					typeof hbRaw.requestedGameHash === 'string'
						? hbRaw.requestedGameHash
						: hbRaw.gameHash ?? null,
				requestedGamePaused:
					typeof hbRaw.requestedGamePaused === 'boolean' ? hbRaw.requestedGamePaused : null,
				fingerprintTailTick:
					typeof hbRaw.fingerprintTailTick === 'number' && !Number.isNaN(hbRaw.fingerprintTailTick)
						? hbRaw.fingerprintTailTick
						: null,
				fingerprintTailFingerprint:
					typeof hbRaw.fingerprintTailFingerprint === 'string' ? hbRaw.fingerprintTailFingerprint : null,
				pastAppliedActions: hbRaw.pastAppliedActions ?? null,
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
			this.heartbeatState.setLatestHostFingerprint(hb.hostFingerprint);
			this.heartbeatState.setLatestExpectingFromPlayerIds(hb.expectingFromPlayerIds);
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

			engineTick = this.session.getEngineTick();

			if (!this.isHost) {
				const hbTickRaw = hbRaw.hostTick;
				const hbTick =
					typeof hbTickRaw === 'number' && !Number.isNaN(hbTickRaw) ? hbTickRaw : null;
				if (hbTick === null) {
					this.nonHostPastAppliedHeartbeatLatch = false;
				} else if (engineTick >= hbTick && !this.session.isPausedForOrderSync()) {
					this.nonHostPastAppliedHeartbeatLatch = false;
				} else if (engineTick < hbTick && this.session.isPausedForOrderSync()) {
					this.nonHostPastAppliedHeartbeatLatch = true;
				}
			}

			if (!this.isHost) {
				this.updateNonHostOptimisticAnchor(engineTick, hb);
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

			if (!this.isRecovering) {
				this.heartbeatTerminalReconciler.observeLocalSyncAnomalies(engineTick);
			}

			if (!this.isHost) {
				if (engineTick < hb.hostTick) {
					this.clearHostAnchorWaitState();
					this.emitBlockingHostPausePlane(false);
				} else {
					this.refreshHostAnchorWaitAndBlocking(engineTick, hb);
					this.maybeImmediateAlignWhenHostExpectsLocalPlayer(engineTick, hb);
				}
				const prevPlane = this.syncReconciler.getLastNonHostHbPausePlane();
				if (
					prevPlane !== null &&
					this.syncReconciler.pausePlaneKeyFromSnap(prevPlane) !== this.syncReconciler.pausePlaneKeyFromHb(hb)
				) {
					this.heartbeatTerminalReconciler.reconcileNonHostPausePlaneTransition(prevPlane, hb, engineTick);
				}
				this.syncReconciler.setLastNonHostHbPausePlane(this.syncReconciler.snapshotHbPausePlane(hb));
				this.maybeDetectOptimisticPlaybackTrueDesync(engineTick, hb);
				this.maybeLogPausePlaneStructuralDivergence(engineTick, hb);
				this.session.setMultiplayerAwaitHostCatchup(false);
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

				if (!this.isRecovering) {
					this.tickNonHostWaitingForHostPausedStall(hb);
					await this.tickNonHostStuckPausedHostAhead(hb, heartbeatMaterialChanged, ordersRecordCount);
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

	/**
	 * Non-host: re-partitions {@link OrderQueueController}'s staging map against the freshest
	 * `hostTick` / local pause plane and applies anything now releasable. Runs at the top of every
	 * non-host heartbeat pass, before new rows are fetched, so a staged peer row is picked up as
	 * soon as the host (or our own pause plane) catches up to it — no soft-align needed.
	 */
	private drainAndApplyStagedRemoteRows(hostTick: number): void {
		const localPauseAtTick = this.session.getWaitingForOrdersBatch()?.atTick ?? null;
		const released = this.orderQueue.drainStagedRemoteRows({ hostTick, localPauseAtTick });
		if (released.length === 0) {
			return;
		}
		const applyResult = this.session.applyRemoteOrders(released);
		this.registerAppliedOrderHashesFromRemoteApplyResult(applyResult);
		this.emit('orders-applied', { count: applyResult.newlyAppliedKeys.length, source: 'poll' });
		logToLobbyLogBattleSync({
			lobbyClient: this.api as unknown as LobbyClient,
			lobbyId: this.lobbyId,
			playerId: this.playerId,
			tick: this.session.getEngineTick(),
			severity: 'info',
			gameId: this.gameId,
			message: 'order queue: drained staged remote rows now applicable',
			context: {
				hostTick,
				localPauseAtTick,
				releasedCount: released.length,
				rows: summarizeRemoteWireRowsForLog(released),
				newlyAppliedKeys: applyResult.newlyAppliedKeys,
				skippedKeys: applyResult.skippedKeys,
			},
		});
	}

	private applyHeartbeatPastAppliedOrders(hb: BattleHeartbeatApiResult): void {
		const list = hb.pastAppliedActions;
		if (list == null || !Array.isArray(list) || list.length === 0) {
			return;
		}
		const toApply: Array<{
			atTick: number;
			order: BattleOrder;
			idHash: string;
			playerId?: string;
		}> = [];
		let maxAt = -1;
		for (const raw of list) {
			if (!raw || typeof raw !== 'object') {
				continue;
			}
			const rec = raw as Record<string, unknown>;
			const atTick = rec.atTick;
			const idHash = rec.idHash;
			const order = rec.order;
			const playerId = rec.playerId;
			if (typeof atTick !== 'number' || Number.isNaN(atTick)) {
				continue;
			}
			if (typeof idHash !== 'string') {
				continue;
			}
			if (!order || typeof order !== 'object') {
				continue;
			}
			const pid =
				typeof playerId === 'string' && playerId.length > 0
					? playerId
					: typeof rec.player_id === 'string' && (rec.player_id as string).length > 0
						? (rec.player_id as string)
						: undefined;
			if (pid === this.playerId) {
				this.serverRangeConfirmedOurOrderHashes.add(idHash);
				this.ourOrdersAwaitingServerRange.delete(idHash);
			}
			toApply.push({ atTick, order: order as BattleOrder, idHash, playerId: pid });
			maxAt = Math.max(maxAt, atTick);
		}
		if (toApply.length > 0) {
			const localPauseAtTick = this.session.getWaitingForOrdersBatch()?.atTick ?? null;
			const hostTickForPartition = typeof hb.hostTick === 'number' ? hb.hostTick : this.latestHeartbeatHostTick;
			const { applyNow, stagedCount } = this.isHost
				? { applyNow: toApply, stagedCount: 0 }
				: this.orderQueue.partitionApplicableRemoteRows(toApply, {
						hostTick: hostTickForPartition,
						localPauseAtTick,
					});
			const applyResult =
				applyNow.length > 0 ? this.session.applyRemoteOrders(applyNow) : { newlyAppliedKeys: [], skippedKeys: [] };
			logToLobbyLogBattleSync({
				lobbyClient: this.api as unknown as LobbyClient,
				lobbyId: this.lobbyId,
				playerId: this.playerId,
				tick: this.session.getEngineTick(),
				severity: 'info',
				gameId: this.gameId,
				message: 'heartbeat pastAppliedActions: session.applyRemoteOrders finished',
				context: {
					rowCount: toApply.length,
					maxAtTickAmongRows: maxAt >= 0 ? maxAt : null,
					hbHostTick: typeof hb.hostTick === 'number' ? hb.hostTick : null,
					hbGameTickEcho: hb.gameTick ?? null,
					hbRequestedGameTick: hb.requestedGameTick ?? null,
					stagedCount,
					rows: summarizeRemoteWireRowsForLog(applyNow),
					newlyAppliedKeys: applyResult.newlyAppliedKeys,
					skippedKeys: applyResult.skippedKeys,
					isHost: this.isHost,
				},
			});
			if (applyNow.length > 0) {
				this.registerAppliedOrderHashesFromRemoteApplyResult(applyResult);
				this.emit('orders-applied', { count: applyResult.newlyAppliedKeys.length, source: 'poll' });
			}
		}
		if (maxAt >= 0) {
			this.lastOrderFetchSince = Math.max(this.lastOrderFetchSince, maxAt + 1);
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
		const orderFetchCursorBefore = this.lastOrderFetchSince;
		const range = await this.api.getBattleOrdersRange(this.lobbyId, this.gameId, {
			playerId: this.playerId,
			sinceTick: sinceTick > 0 ? sinceTick : undefined,
			untilTick: untilTick >= 0 ? untilTick : undefined,
		});
		const toApply: Array<{ atTick: number; order: BattleOrder; idHash: string; playerId: string }> = [];
		for (const rec of range.orders) {
			if (rec.playerId === this.playerId) {
				this.serverRangeConfirmedOurOrderHashes.add(rec.idHash);
				this.ourOrdersAwaitingServerRange.delete(rec.idHash);
			}
			toApply.push({
				atTick: rec.atTick,
				order: rec.order,
				idHash: rec.idHash,
				playerId: rec.playerId,
			});
		}
		if (toApply.length > 0) {
			const localPauseAtTick = this.session.getWaitingForOrdersBatch()?.atTick ?? null;
			const { applyNow, stagedCount } = this.isHost
				? { applyNow: toApply, stagedCount: 0 }
				: this.orderQueue.partitionApplicableRemoteRows(toApply, {
						hostTick: this.latestHeartbeatHostTick,
						localPauseAtTick,
					});
			const applyResult =
				applyNow.length > 0 ? this.session.applyRemoteOrders(applyNow) : { newlyAppliedKeys: [], skippedKeys: [] };
			logToLobbyLogBattleSync({
				lobbyClient: this.api as unknown as LobbyClient,
				lobbyId: this.lobbyId,
				playerId: this.playerId,
				tick: this.session.getEngineTick(),
				severity: 'info',
				gameId: this.gameId,
				message: 'poll fetchAndApplyNewOrders: session.applyRemoteOrders finished',
				context: {
					rescanOrdersFromTickZero: rescan,
					sinceTick,
					untilTick,
					rangeRowCount: range.orders.length,
					ordersRecordCountFromHeartbeat: opts?.serverOrderRecordCount ?? null,
					orderFetchCursorBefore,
					stagedCount,
					rows: summarizeRemoteWireRowsForLog(applyNow),
					newlyAppliedKeys: applyResult.newlyAppliedKeys,
					skippedKeys: applyResult.skippedKeys,
					isHost: this.isHost,
				},
			});
			if (applyNow.length > 0) {
				this.registerAppliedOrderHashesFromRemoteApplyResult(applyResult);
				this.emit('orders-applied', { count: applyResult.newlyAppliedKeys.length, source: 'poll' });
			}
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
	}): boolean {
		return this.orderQueue.applyDeferredRowLocallyIfNeeded(item);
	}

	/** Host-only: queue locally after append so `tryResumeParallel` → merge sees the row on disk first. */
	private applyLocalSubmitOrderAfterAppend(
		order: BattleOrder,
		atTick: number,
		idHash: string,
		ctx: {
			localEngineTick: number;
			localLatestFingerprintTick: number | null;
			effectiveHostTickCandidate: number | null;
		},
	): void {
		const applyResult = this.session.applyRemoteOrders([
			{ atTick, order, idHash, playerId: this.playerId },
		]);
		this.registerAppliedOrderHashesFromRemoteApplyResult(applyResult);
		this.emit('orders-applied', { count: applyResult.newlyAppliedKeys.length, source: 'submit' });
		logToLobbyLogBattleSync({
			lobbyClient: this.api as unknown as LobbyClient,
			lobbyId: this.lobbyId,
			playerId: this.playerId,
			tick: atTick,
			severity: 'info',
			gameId: this.gameId,
			message: 'host order applied locally after append (append → merge chain)',
			context: {
				idHash,
				abilityId: order.abilityId,
				unitId: order.unitId,
				order,
				isHost: true,
				lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
				lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
				localEngineTick: ctx.localEngineTick,
				localLatestFingerprintTick: ctx.localLatestFingerprintTick,
				effectiveHostTickCandidate: ctx.effectiveHostTickCandidate,
				isPausedForOrderSync: this.session.isPausedForOrderSync(),
				queuedDeferredBeforeSubmit: this.deferredLocalOrders.length,
			},
		});
	}

	private async persistOrder(
		order: BattleOrder,
		atTick: number,
		idHash: string,
		allowDeferralOnHostLag: boolean,
	): Promise<boolean> {
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
				logType: 'debug',
				gameId: this.gameId,
				message: 'appendBattleOrder network error; deferred for retry',
				context: { abilityId: order.abilityId, unitId: order.unitId },
			});
			this.emitHostCatchupWaitState();
			return false;
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
				this.orderQueue.noteAcceptedOurPostAtTick(atTick);
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
				logType: 'debug',
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
			return true;
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
				logType: 'debug',
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
			return false;
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
			return false;
		}
		if (res.rejectedReason === 'tick_in_past') {
			this.emitRejectedOrderSyncDetail(res.rejectedReason);
			this.deferredLocalOrders = this.deferredLocalOrders.filter((item) => item.idHash !== idHash);
			this.ourOrdersAwaitingServerRange.delete(idHash);
			const hostTick = typeof res.hostTick === 'number' ? res.hostTick : this.latestHeartbeatHostTick;
			const hostFp =
				typeof res.hostFingerprint === 'string' && res.hostFingerprint !== ''
					? res.hostFingerprint
					: this.heartbeatState.getLatestHostFingerprint();
			const localRow =
				hostTick >= 0 ? this.session.getFingerprintRange(hostTick, hostTick)[0] : null;
			const fingerprintsAgree =
				hostFp != null && localRow != null && localRow.fp === hostFp;
			logToLobbyLog({
				lobbyClient: this.api as unknown as LobbyClient,
				lobbyId: this.lobbyId,
				playerId: this.playerId,
				tick: atTick,
				severity: 'warn',
				logType: 'desync',
				gameId: this.gameId,
				message: fingerprintsAgree
					? 'appendBattleOrder rejected tick_in_past; soft-aligning to host pause plane'
					: 'appendBattleOrder rejected tick_in_past; requesting resync',
				context: {
					minAllowedTick: res.minAllowedTick,
					lastSeenHeartbeatHostTick: this.latestHeartbeatHostTick,
					lastHeartbeatAgeMs: this.getLastHeartbeatAgeMs(),
					serverHostTickAtAppend: res.hostTick ?? null,
					serverHostFingerprintAtAppend: res.hostFingerprint ?? null,
					fingerprintsAgree,
					localFingerprintAtHostTail: localRow?.fp?.slice(0, 12) ?? null,
				},
			});
			if (fingerprintsAgree) {
				void this.softAlignAfterStaleOrderBatch('tick-in-past');
			} else {
				this.requestResync('tick-in-past');
			}
			return false;
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
				logType: 'desync',
				gameId: this.gameId,
				message: `appendBattleOrder rejected ${res.rejectedReason}; requesting resync`,
				context: { unitId: order.unitId },
			});
			this.requestResync(res.rejectedReason === 'not_unit_owner' ? 'not-unit-owner' : 'unknown-unit');
			return false;
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
		return false;
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
						logType: 'debug',
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
						logType: 'debug',
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
			const skippedPastBatchApply = this.applyDeferredRowLocallyIfNeeded(item);
			await this.persistOrder(item.order, item.atTick, item.idHash, true);
			flushAttempted++;
			if (skippedPastBatchApply) {
				// Host has the order; local sim is ahead of that batch — align before more apply/POST.
				this.softAlignToHostPausePlane('deferred-past-batch-apply');
				break;
			}
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
				logType: 'debug',
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
		const skippedPastBatchApply = this.applyDeferredRowLocallyIfNeeded(oldestDeferred);
		await this.persistOrder(oldestDeferred.order, oldestDeferred.atTick, oldestDeferred.idHash, false);
		if (skippedPastBatchApply) {
			this.softAlignToHostPausePlane('deferred-past-batch-apply');
		}
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
		this.nonHostPastAppliedHeartbeatLatch = false;
		this.orderQueue.resetLocalOptimisticOrdersOnResync();
		this.resetNonHostAheadStreak();
		this.previouslySyncedAtTick = null;
		this.nonHostOptimisticPlayaheadAnchor = null;
		this.waitingForHostPausedStallSinceMs = null;
		this.waitingForHostPausedStallMaterialKey = null;
		this.immediateAlignSkipLogKey = null;
		this.structuralDivergenceLoggedForBatch = null;
		this.resetStuckPausedHostAheadStreak();
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
		this.nonHostOptimisticPlayaheadAnchor = null;
	}

	private emitBlockingHostPausePlane(blocking: boolean): void {
		this.syncReconciler.emitBlockingHostPausePlane(blocking);
	}

	private refreshHostAnchorWaitAndBlocking(engineTick: number, hb: BattleNetEventMap['heartbeat']): void {
		this.hostAnchorWait.refreshHostAnchorWaitAndBlocking(engineTick, hb);
	}

	/**
	 * Lobby 39E984: host is paused waiting for *this* player at an earlier batch while the local
	 * sim is blocked on a later pause plane. Soft-align immediately instead of waiting for the
	 * 15s waiting_for_host stall watchdog.
	 */
	private maybeImmediateAlignWhenHostExpectsLocalPlayer(
		engineTick: number,
		hb: BattleNetEventMap['heartbeat'],
	): void {
		if (this.isRecovering) {
			return;
		}
		if (!hb.hostPaused) {
			return;
		}
		const expecting = hb.expectingFromPlayerIds;
		if (!Array.isArray(expecting) || !expecting.includes(this.playerId)) {
			return;
		}
		const hostBatch = hb.orderBatchAtTick ?? hb.pausedAtTick;
		const localBatch = this.session.getWaitingForOrdersBatch();
		if (hostBatch == null || localBatch == null) {
			return;
		}
		if (localBatch.atTick <= hostBatch && engineTick <= hb.hostTick) {
			return;
		}
		if (!this.syncReconciler.computeBlockingNonHostPausePlane(engineTick, hb)) {
			return;
		}
		if (this.session.isInteractiveTargetingPreviewActive()) {
			this.logImmediateAlignSkipped(
				'its_preview',
				engineTick,
				hostBatch,
				'ITS preview playahead in progress while host waits on us — not stuck',
			);
			return;
		}
		if (
			this.deferredLocalOrders.some((r) => r.atTick === hostBatch) ||
			this.orderQueue.hasAcceptedOurPostAtTick(hostBatch)
		) {
			this.logImmediateAlignSkipped(
				'deferred_or_accepted',
				engineTick,
				hostBatch,
				'local answer queued or POST already accepted at host batch — not stuck',
				{
					hasDeferredAtBatch: this.deferredLocalOrders.some((r) => r.atTick === hostBatch),
					hasAcceptedPostAtBatch: this.orderQueue.hasAcceptedOurPostAtTick(hostBatch),
				},
			);
			return;
		}
		if (this.heartbeatListsOurFinalizedOrderAt(hb, hostBatch)) {
			this.logImmediateAlignSkipped(
				'pending_finalized',
				engineTick,
				hostBatch,
				'heartbeat pendingOrders lists our finalized endTurn row at host batch — not stuck',
			);
			return;
		}
		// Playahead divergence observability (5E0F6B): a fingerprint mismatch here means the local
		// and host sims have genuinely diverged, not just fallen out of sync temporarily — escalate
		// this line's severity so it stands out from the routine soft-align warn.
		const localFpRowAtHostTick = this.session.getFingerprintRange(hb.hostTick, hb.hostTick)[0];
		const localFpAtHostTick = localFpRowAtHostTick?.fp ?? null;
		const hostFingerprint = hb.hostFingerprint ?? null;
		const fpMatchAtHostTick: boolean | null =
			localFpAtHostTick != null && hostFingerprint != null ? localFpAtHostTick === hostFingerprint : null;
		logToLobbyLogBattleSync({
			lobbyClient: this.api as unknown as LobbyClient,
			lobbyId: this.lobbyId,
			playerId: this.playerId,
			tick: engineTick,
			severity: fpMatchAtHostTick === false ? 'error' : 'warn',
			logType: 'desync',
			gameId: this.gameId,
			message:
				'host expects local player at earlier batch while local pause plane is ahead — soft-aligning',
			context: {
				engineTick,
				hostTick: hb.hostTick,
				hostBatchAtTick: hostBatch,
				localBatchAtTick: localBatch.atTick,
				expectingFromPlayerIds: expecting,
				localFpAtHostTick,
				hostFingerprint,
				fpMatchAtHostTick,
			},
		});
		this.softAlignToHostPausePlane('host-expects-local-player-ahead-batch');
	}

	private logImmediateAlignSkipped(
		guard: 'its_preview' | 'deferred_or_accepted' | 'pending_finalized',
		engineTick: number,
		hostBatch: number,
		why: string,
		extraContext: Record<string, unknown> = {},
	): void {
		const logKey = `${guard}|${hostBatch}`;
		if (this.immediateAlignSkipLogKey === logKey) {
			return;
		}
		this.immediateAlignSkipLogKey = logKey;
		logToLobbyLogBattleSync({
			lobbyClient: this.api as unknown as LobbyClient,
			lobbyId: this.lobbyId,
			playerId: this.playerId,
			tick: engineTick,
			severity: 'info',
			gameId: this.gameId,
			message: 'maybeImmediateAlignWhenHostExpectsLocalPlayer skipped — expected playahead, not stuck',
			context: {
				guard,
				why,
				hostBatchAtTick: hostBatch,
				engineTick,
				...extraContext,
			},
		});
	}

	private heartbeatListsOurFinalizedOrderAt(
		hb: BattleNetEventMap['heartbeat'],
		hostBatch: number,
	): boolean {
		const pending = hb.pendingOrders;
		if (!Array.isArray(pending)) {
			return false;
		}
		for (const row of pending) {
			if (typeof row !== 'object' || row == null) {
				continue;
			}
			if (row.playerId !== this.playerId || row.atTick !== hostBatch) {
				continue;
			}
			if (row.finalized === false) {
				continue;
			}
			const order = row.order;
			if (typeof order !== 'object' || order == null) {
				continue;
			}
			if ((order as BattleOrder).endTurn !== true) {
				continue;
			}
			return true;
		}
		return false;
	}

	private materialKeyForHostTailStall(hb: BattleNetEventMap['heartbeat']): string {
		return `${hb.hostTick}|${hb.hostFingerprint ?? ''}`;
	}

	private updateNonHostOptimisticAnchor(engineTick: number, hb: BattleNetEventMap['heartbeat']): void {
		if (engineTick <= hb.hostTick) {
			this.nonHostOptimisticPlayaheadAnchor = null;
			return;
		}
		if (this.nonHostOptimisticPlayaheadAnchor == null) {
			this.nonHostOptimisticPlayaheadAnchor = {
				hostTick: hb.hostTick,
				localTick: engineTick,
				startedAtMs: Date.now(),
			};
		}
	}

	private maybeDetectOptimisticPlaybackTrueDesync(engineTick: number, hb: BattleNetEventMap['heartbeat']): void {
		const anchor = this.nonHostOptimisticPlayaheadAnchor;
		if (anchor == null) {
			return;
		}
		if (!hb.hostPaused || !this.session.isPausedForOrderSync()) {
			return;
		}
		if (hb.hostTick === anchor.hostTick || engineTick === anchor.localTick) {
			return;
		}
		if (hb.hostTick === engineTick) {
			return;
		}
		const localRow = this.session.getFingerprintRange(hb.hostTick, hb.hostTick)[0];
		const localLatest = this.session.getLatestFingerprint();
		const hostTailFp = hb.hostFingerprint;
		// Benign optimistic playahead: client submitted the last order and ran to a later
		// pause while the host is still catching up. Fingerprints at hostTick still match.
		// Only treat misaligned pauses as true desync when the host-tail hash disagrees
		// (or we have no local row to compare). Lobby BBA219 false-positived here.
		if (hostTailFp != null && localRow != null && localRow.fp === hostTailFp) {
			return;
		}
		logToLobbyLogBattleSync({
			lobbyClient: this.api as unknown as LobbyClient,
			lobbyId: this.lobbyId,
			playerId: this.playerId,
			tick: engineTick,
			severity: 'error',
			logType: 'desync',
			gameId: this.gameId,
			message: 'optimistic playahead divergence: host and client paused on misaligned ticks vs optimistic anchor',
			context: {
				anchor,
				engineTick,
				hostTick: hb.hostTick,
				hostPaused: hb.hostPaused,
				hostFingerprintHead: hostTailFp?.slice(0, 12) ?? null,
				orderBatchAtTick: hb.orderBatchAtTick,
				expectingFromPlayerIds: hb.expectingFromPlayerIds,
				localFingerprintAtHostTail: localRow?.fp?.slice(0, 12) ?? null,
				localLatestTick: localLatest?.tick ?? null,
				localLatestFpHead: localLatest?.fp?.slice(0, 12) ?? null,
			},
		});
		this.nonHostOptimisticPlayaheadAnchor = null;
		this.requestResync('optimistic-playback-divergence');
	}

	/**
	 * Structural-divergence observability (5E0F6B batch 580): the host is paused at parallel order
	 * batch `B` while the local sim already ran straight through `B` without ever forming its own
	 * pause there (the local pause plane sits at some other tick). If the local ring fingerprint at
	 * `hostTick` still *agrees* with the host's, this is not a hash mismatch — it is the preview/canon
	 * engine bug family (kept ITS preview timeline diverging from the host's canonical replay of the
	 * same wire order). Logs once per `B`; escalation stays on the existing align/desync paths.
	 */
	private maybeLogPausePlaneStructuralDivergence(engineTick: number, hb: BattleNetEventMap['heartbeat']): void {
		if (!hb.hostPaused) {
			return;
		}
		const hostBatch = hb.orderBatchAtTick ?? hb.pausedAtTick;
		if (hostBatch == null || engineTick <= hostBatch) {
			return;
		}
		const localPauseAtTick = this.session.getWaitingForOrdersBatch()?.atTick ?? null;
		if (localPauseAtTick === hostBatch) {
			return;
		}
		const hostFp = hb.hostFingerprint;
		if (hostFp == null || hostFp === '') {
			return;
		}
		const localRow = this.session.getFingerprintRange(hb.hostTick, hb.hostTick)[0];
		if (localRow == null || localRow.fp !== hostFp) {
			return;
		}
		const anchor = this.nonHostOptimisticPlayaheadAnchor;
		const playaheadAtSameHostTick = anchor != null && hb.hostTick === anchor.hostTick;
		if (playaheadAtSameHostTick) {
			const elapsedMs = Date.now() - anchor.startedAtMs;
			if (elapsedMs < BATTLE_NET_STRUCTURAL_DIVERGENCE_GRACE_MS) {
				return;
			}
			this.syncStatusController.setStatus(
				'waiting_for_host',
				'Local sim advanced ahead of the host during optimistic playahead; waiting for the host to catch up.',
			);
		}
		if (this.structuralDivergenceLoggedForBatch === hostBatch) {
			return;
		}
		this.structuralDivergenceLoggedForBatch = hostBatch;
		logToLobbyLogBattleSync({
			lobbyClient: this.api as unknown as LobbyClient,
			lobbyId: this.lobbyId,
			playerId: this.playerId,
			tick: engineTick,
			severity: 'error',
			logType: 'desync',
			gameId: this.gameId,
			message: 'pause plane structural divergence: host paused at batch local sim never formed',
			context: {
				hostTick: hb.hostTick,
				hostBatchAtTick: hostBatch,
				engineTick,
				localBatchAtTick: localPauseAtTick,
				hostFingerprintHead: hostFp.slice(0, 12),
				localFpAtHostTickHead: localRow.fp.slice(0, 12),
				optimisticPlayaheadAnchorHostTick: anchor?.hostTick ?? null,
				optimisticPlayaheadStartedAtMs: anchor?.startedAtMs ?? null,
				optimisticPlayaheadElapsedMs:
					anchor != null ? Date.now() - anchor.startedAtMs : null,
			},
		});
	}

	private tickNonHostWaitingForHostPausedStall(hb: BattleNetEventMap['heartbeat']): void {
		const material = this.materialKeyForHostTailStall(hb);
		const stalledPhase =
			this.syncStatusController.getStatus() === 'waiting_for_host' && this.session.isPausedForOrderSync();
		if (!stalledPhase) {
			this.waitingForHostPausedStallSinceMs = null;
			this.waitingForHostPausedStallMaterialKey = null;
			return;
		}
		if (this.waitingForHostPausedStallMaterialKey !== material) {
			this.waitingForHostPausedStallMaterialKey = material;
			this.waitingForHostPausedStallSinceMs = Date.now();
			return;
		}
		if (this.waitingForHostPausedStallSinceMs == null) {
			this.waitingForHostPausedStallSinceMs = Date.now();
			return;
		}
		if (Date.now() - this.waitingForHostPausedStallSinceMs >= BATTLE_NET_WAITING_HOST_PAUSED_STALL_MS) {
			this.waitingForHostPausedStallSinceMs = null;
			this.waitingForHostPausedStallMaterialKey = null;
			logToLobbyLogBattleSync({
				lobbyClient: this.api as unknown as LobbyClient,
				lobbyId: this.lobbyId,
				playerId: this.playerId,
				tick: this.session.getEngineTick(),
				severity: 'warn',
				logType: 'desync',
				gameId: this.gameId,
				message: 'waiting_for_host paused stall — heartbeat material unchanged; forcing full resync',
				context: {
					stallMs: BATTLE_NET_WAITING_HOST_PAUSED_STALL_MS,
					material,
				},
			});
			this.requestResync('waiting-for-host-paused-stall');
		}
	}

	/**
	 * Detector for the **stuck paused host ahead** deadlock: non-host client is paused for parallel
	 * order sync at local tick `N` while server `hostTick` has moved far ahead (e.g. `N+50`) because
	 * client missed intermediate order rows.
	 *
	 * Triggers when ALL hold for {@link BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_POLLS} consecutive polls:
	 *  - `!isHost`,
	 *  - `session.isPausedForOrderSync()`,
	 *  - `hostTick - engineTick >= BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_GAP`,
	 *  - heartbeat material `(hostTick, hostFingerprint)` changed **or** `ordersRecordCount` increased
	 *    (server moved forward) AND local `engineTick` did **not** advance.
	 *
	 * On trigger: force an order rescan from tick 0 (orders-first remediation). If after rescan the
	 * stall persists for {@link BATTLE_NET_STUCK_PAUSED_RESYNC_POLLS} more polls, escalate to
	 * `requestResync('stuck-paused-host-ahead')`.
	 */
	private async tickNonHostStuckPausedHostAhead(
		hb: BattleNetEventMap['heartbeat'],
		heartbeatMaterialChanged: boolean,
		ordersRecordCount: number | null,
	): Promise<void> {
		if (this.isHost) {
			this.resetStuckPausedHostAheadStreak();
			return;
		}
		const engineTick = this.session.getEngineTick();
		const paused = this.session.isPausedForOrderSync();
		const gap = hb.hostTick - engineTick;
		if (!paused || gap < BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_GAP) {
			this.resetStuckPausedHostAheadStreak();
			return;
		}
		// engine catching up — clear streak only when the host gap is closed (lobby 5E0F6B).
		if (
			this.stuckPausedHostAheadPrevEngineTick !== null &&
			engineTick > this.stuckPausedHostAheadPrevEngineTick
		) {
			if (
				engineTick >= hb.hostTick ||
				hb.hostTick - engineTick < BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_GAP
			) {
				this.resetStuckPausedHostAheadStreak();
				return;
			}
		}
		const ordersIncreased = ordersRecordCount !== null && ordersRecordCount > this.lastSeenOrdersRecordCount;
		const serverMoved = heartbeatMaterialChanged || ordersIncreased;
		const engineStalled =
			this.stuckPausedHostAheadPrevEngineTick === null ||
			engineTick === this.stuckPausedHostAheadPrevEngineTick;

		if (!serverMoved || !engineStalled) {
			// Conditions not met this poll — record current engineTick but do not count the poll.
			// (Tracking prev engineTick lets the next poll detect a stall vs progress.)
			this.stuckPausedHostAheadPrevEngineTick = engineTick;
			return;
		}

		this.stuckPausedHostAheadPollStreak += 1;
		this.stuckPausedHostAheadPrevEngineTick = engineTick;

		if (
			!this.stuckPausedHostAheadRescanDone &&
			this.stuckPausedHostAheadPollStreak >= BATTLE_NET_STUCK_PAUSED_HOST_AHEAD_POLLS
		) {
			logToLobbyLogBattleSync({
				lobbyClient: this.api as unknown as LobbyClient,
				lobbyId: this.lobbyId,
				playerId: this.playerId,
				tick: engineTick,
				severity: 'info',
				gameId: this.gameId,
				message: 'stuck-paused host ahead: forcing order rescan from tick 0',
				context: {
					engineTick,
					hostTick: hb.hostTick,
					gap,
					streak: this.stuckPausedHostAheadPollStreak,
					orderBatchAtTick: hb.orderBatchAtTick,
					ordersRecordCount,
					lastSeenOrdersRecordCount: this.lastSeenOrdersRecordCount,
				},
			});
			await this.forceCatchupOrderRescan(hb.hostTick, ordersRecordCount);
			this.stuckPausedHostAheadRescanDone = true;
			this.stuckPausedHostAheadPostRescanPolls = 0;
			// Re-read engineTick — rescan may have applied orders that advanced the local sim.
			const engineTickAfter = this.session.getEngineTick();
			this.stuckPausedHostAheadPrevEngineTick = engineTickAfter;
			if (engineTickAfter >= hb.hostTick) {
				this.resetStuckPausedHostAheadStreak();
			}
			return;
		}

		if (this.stuckPausedHostAheadRescanDone) {
			this.stuckPausedHostAheadPostRescanPolls += 1;
			if (this.stuckPausedHostAheadPostRescanPolls >= BATTLE_NET_STUCK_PAUSED_RESYNC_POLLS) {
				logToLobbyLogBattleSync({
					lobbyClient: this.api as unknown as LobbyClient,
					lobbyId: this.lobbyId,
					playerId: this.playerId,
					tick: engineTick,
					severity: 'warn',
					logType: 'desync',
					gameId: this.gameId,
					message:
						'stuck-paused host ahead: rescan did not unblock client — requesting full resync',
					context: {
						engineTick,
						hostTick: hb.hostTick,
						gap,
						streak: this.stuckPausedHostAheadPollStreak,
						postRescanPolls: this.stuckPausedHostAheadPostRescanPolls,
						orderBatchAtTick: hb.orderBatchAtTick,
						ordersRecordCount,
					},
				});
				this.resetStuckPausedHostAheadStreak();
				this.requestResync('stuck-paused-host-ahead');
			}
		}
	}

	private resetStuckPausedHostAheadStreak(): void {
		this.stuckPausedHostAheadPollStreak = 0;
		this.stuckPausedHostAheadPrevEngineTick = null;
		this.stuckPausedHostAheadRescanDone = false;
		this.stuckPausedHostAheadPostRescanPolls = 0;
	}

	/**
	 * Force a full rescan of `applied + pending` orders from tick 0 to `hostTick`, applying any rows
	 * not already applied by the session (session dedupe + {@link appliedOrderIdHashes} alignment). Reuses {@link fetchAndApplyNewOrders} with
	 * `rescanOrdersFromTickZero: true` so the dedupe stays correct.
	 */
	private async forceCatchupOrderRescan(hostTick: number, serverOrderRecordCount: number | null): Promise<void> {
		// Reset the cursor so the next normal poll cannot skip rows we may have missed; the rescan
		// itself uses `sinceTick = 0` regardless of the cursor.
		this.lastOrderFetchSince = 0;
		await this.fetchAndApplyNewOrders(hostTick, {
			rescanOrdersFromTickZero: true,
			serverOrderRecordCount,
		});
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
		includePastApplied?: boolean;
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

	async replayMissionFromStart(): Promise<void> {
		return this.recovery.replayMissionFromStart();
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
