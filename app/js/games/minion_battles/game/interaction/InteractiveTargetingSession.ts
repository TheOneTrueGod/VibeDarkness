/**
 * InteractiveTargetingSession — manages the local-preview engine run for
 * abilities that use SelectTargetDef (e.g. Double Punch).
 *
 * Flow:
 *   1. begin()      — snapshot engine state, choose rollback vs in-place mode, queue a
 *                     preview order with targetsByLabel: {}, start the engine. Rollback mode
 *                     also suppresses onParallelBatchResolved; in-place relies on flag guards.
 *   2. resolveTarget() — called by UI when the player clicks a target; unpauses engine.
 *   3. reset()      — refresh remote orders, restore to mark, discard collected targets.
 *   4. replay()     — refresh remote orders, restore to mark, re-queue order with all collected targets pre-filled.
 *   5. commit()     — refresh remote orders; rollback: restore to mark, apply held remote orders, submit via BattleNet;
 *                     in-place (solo host): keep preview state, persist order without re-apply.
 */

import type { BattleOrder, ResolvedTarget, SerializedGameState } from '../types';
import type { BattleSession } from '../BattleSession';
import { getSelectTargetDefsFromTimings } from '../../abilities/targeting';
import { getAbility } from '../../abilities/AbilityRegistry';
import { findPreviewDeferredSelectLabel } from './selectTargetLookahead';
import { isPreviewCastConditionalCancelPaused } from './isITSPreviewComplete';
import {
    type ItsActionSource,
    type ItsCancelReason,
    type ItsLogSnapshot,
    captureItsLogSnapshot,
    logItsButtonClick,
    logItsPreviewCancelled,
    logItsPreviewEnded,
    logItsPreviewStarted,
    logItsTargetAdded,
} from './itsLobbyLog';

/** Map frozen select labels to positional targets collected so far (commit + preview orders). */
export function buildPositionalTargetsFromLabels(
    selectLabels: readonly string[],
    collectedTargets: Record<string, ResolvedTarget>,
): ResolvedTarget[] {
    return selectLabels
        .map((label) => collectedTargets[label])
        .filter((t): t is ResolvedTarget => t != null);
}

/** Payload for a movement re-input collected during interactive preview. */
export interface MovementReInput {
    movePath: { col: number; row: number }[];
    moveTargetUnitId?: string;
    moveTargetPixel?: { x: number; y: number };
}

/** Minimal info held for one deferred remote order row. */
export interface HeldRemoteOrder {
    atTick: number;
    order: BattleOrder;
    /** Dedupe key computed at hold time (mirrors BattleSession.appliedRemoteOrderKeys logic). */
    key: string | null;
}

/** True when a held remote row is a stand-in pass matching the preview's assumed wait. */
export function isPurePassOrder(order: BattleOrder): boolean {
    if (order.abilityId !== 'wait' || order.endTurn !== true) return false;
    if (order.movePath != null && order.movePath.length > 0) return false;
    if (order.moveTargetUnitId != null) return false;
    if (order.moveTargetPixel != null) return false;
    if (order.targets != null && order.targets.length > 0) return false;
    if (order.movementByLabel != null && Object.keys(order.movementByLabel).length > 0) return false;
    return true;
}

function resolvedTargetMatches(a: ResolvedTarget, b: ResolvedTarget): boolean {
    if (a.type !== b.type) return false;
    if (a.type === 'unit' && b.type === 'unit') return a.unitId === b.unitId;
    if (a.type === 'pixel' && b.type === 'pixel') {
        return a.position?.x === b.position?.x && a.position?.y === b.position?.y;
    }
    return false;
}

/** Map label → entry in `targets` (same reference) so MeleeAttack indexOf works. */
function buildTargetsByLabelFromPositional(
    selectLabels: readonly string[],
    collectedTargets: Record<string, ResolvedTarget>,
    targets: ResolvedTarget[],
): Record<string, ResolvedTarget> {
    const targetsByLabel: Record<string, ResolvedTarget> = {};
    for (const label of selectLabels) {
        const collected = collectedTargets[label];
        if (!collected) continue;
        const idx = targets.findIndex((t) => resolvedTargetMatches(t, collected));
        targetsByLabel[label] = idx >= 0 ? targets[idx]! : collected;
    }
    return targetsByLabel;
}

/** Build the committed BattleOrder from frozen labels + collected targets/movement (rollback and in-place). */
export function buildFinalizedSequentialTargetingOrder(
    selectLabels: readonly string[],
    collectedTargets: Record<string, ResolvedTarget>,
    baseOrder: BattleOrder,
    movementByLabel?: Record<string, MovementReInput>,
    positionalTargetsOverride?: ResolvedTarget[],
): BattleOrder {
    // Melee multi-lock override is only valid for a single select label. Multi-select
    // abilities (e.g. Double Punch) must use per-label collected targets.
    const useMeleeOverride =
        selectLabels.length === 1
        && positionalTargetsOverride != null
        && positionalTargetsOverride.length > 0;
    const targets = useMeleeOverride
        ? positionalTargetsOverride
        : buildPositionalTargetsFromLabels(selectLabels, collectedTargets);
    return {
        ...baseOrder,
        targets,
        targetsByLabel: buildTargetsByLabelFromPositional(selectLabels, collectedTargets, targets),
        endTurn: true,
        ...(movementByLabel && Object.keys(movementByLabel).length > 0 ? { movementByLabel } : {}),
    };
}

export class InteractiveTargetingSession {
    private _isActive = false;
    private mark: SerializedGameState | null = null;
    private _abilityId: string | null = null;
    private _unitId: string | null = null;
    /** The original full order that triggered the preview (carries movePath etc.). */
    private originalOrder: BattleOrder | null = null;
    /** Targets collected so far, keyed by SelectTargetDef label. */
    readonly collectedTargets: Record<string, ResolvedTarget> = {};
    /** Movement re-inputs collected via resolveMovement(), keyed by SelectTargetDef label. */
    private collectedMovementByLabel: Record<string, MovementReInput> = {};
    /** Full positional targets array (lock-ons + aim pixel) supplied by UI on resolveTarget; empty for non-melee abilities. */
    private _orderPositionalTargets: ResolvedTarget[] = [];
    /** Remote orders that arrived while preview is active; held until preview ends. */
    private heldRemoteOrders: Map<string, HeldRemoteOrder> = new Map();
    /** The label currently waiting for player input (set externally by UI). */
    private _currentLabel: string | null = null;
    /** SelectTargetDef labels frozen at begin() — used for all-collected checks and commit mapping. */
    private _selectLabels: readonly string[] = [];
    /** False until the preview order is queued (deferred for t=0 first-select abilities). */
    private _previewOrderQueued = false;
    /** Other batch waiters that received an assumed wait at begin() (not already confirmed). */
    private assumedWaitUnitIds: Set<string> = new Set();
    /** True while a commit is running (guards re-entry from concurrent commit triggers). */
    private _commitInFlight = false;

    // -------------------------------------------------------------------------
    // Public state
    // -------------------------------------------------------------------------

    get isActive(): boolean {
        return this._isActive;
    }

    get currentLabel(): string | null {
        return this._currentLabel;
    }

    get abilityId(): string | null {
        return this._abilityId;
    }

    get unitId(): string | null {
        return this._unitId;
    }

    /** Engine tick captured in the mark snapshot when preview began; null when preview inactive. */
    get savedLocalTick(): number | null {
        if (!this._isActive || this.mark == null) return null;
        const tick = this.mark.gameTick;
        return typeof tick === 'number' && !Number.isNaN(tick) ? tick : null;
    }

    /** Ordered SelectTargetDef labels captured when the preview started. */
    get selectLabels(): readonly string[] {
        return this._selectLabels;
    }

    /** True when every frozen label has a collected target. */
    allTargetsCollected(): boolean {
        return this._selectLabels.length > 0
            && this._selectLabels.every((label) => label in this.collectedTargets);
    }

    setCurrentLabel(label: string | null): void {
        this._currentLabel = label;
    }

    // -------------------------------------------------------------------------
    // Core operations
    // -------------------------------------------------------------------------

    /**
     * Start an interactive targeting preview for the given ability.
     *
     * - Snapshots engine state (the mark).
     * - Replaces `onParallelBatchResolved` with null and auto-queues assumed waits for other
     *   batch waiters that are not already confirmed (commit-time logic decides in-place vs rollback).
     * - Queues a preview order with `targetsByLabel: {}` (interactive sentinel).
     *   When the first select is deferred (elapsed 0 or windup lunge), the order is held
     *   until that target is collected so beginActiveCast sees positional targets.
     * - `tryResumeParallel` is triggered automatically by applyOrder.
     */
    begin(order: BattleOrder, session: BattleSession): boolean {
        const engineForGate = session.getEngine();
        const batchForGate = engineForGate?.waitingForOrders;
        if (
            batchForGate != null
            && (
                !session.isOrderBatchTickSubmittable(batchForGate.atTick)
                || !session.isLocalPlayerExpectedToAct()
            )
        ) {
            return false;
        }

        const abilityId = order.abilityId;
        const unitId = order.unitId;
        const engine = session.getEngine();
        if (!engine) return false;

        const batch = engine.state.orderMgr.waitingForOrders;
        if (!batch) return false;
        if (!batch.waiters.some((w) => w.unitId === unitId)) return false;
        if (engine.state.orderMgr.hasPendingEndTurnOrderForUnit(unitId, batch.atTick)) return false;

        const ability = getAbility(abilityId);
        const caster = engine.getUnit(unitId);
        if (!ability || !caster) return false;

        const selectDefs = getSelectTargetDefsFromTimings(ability, caster, engine);
        if (selectDefs.length === 0) return false;

        this._selectLabels = selectDefs.map((def) => def.label);

        this._isActive = true;
        this._abilityId = abilityId;
        this._unitId = unitId;
        this.originalOrder = order;
        // Clear any leftover state from a previous session.
        Object.keys(this.collectedTargets).forEach((k) => delete this.collectedTargets[k]);
        this.collectedMovementByLabel = {};
        this._orderPositionalTargets = [];
        this.heldRemoteOrders.clear();
        this._currentLabel = null;
        this._previewOrderQueued = false;
        this.assumedWaitUnitIds = new Set();

        // Snapshot the pause state (include runtime fingerprint so restore does not reset to fingerprintInitial).
        const markState = engine.toJSON();
        markState.checkpointRuntimeFingerprintHex = engine.getRuntimeFingerprintHex();
        this.mark = markState;

        // Flag the engine so host callbacks (checkpoint, fingerprint, batch-resolved) skip
        // during the preview run. This prevents the preview state from being persisted to the server.
        engine.isSequentialTargetingPreview = true;
        engine.sequentialTargetingPreviewCast = { unitId, abilityId, startRound: engine.roundNumber };

        engine.setOnParallelBatchResolved(null);

        // Other players may not have submitted yet — queue assumed waits so the preview can advance.
        for (const waiter of batch.waiters) {
            if (waiter.unitId === unitId) continue;
            if (engine.state.orderMgr.hasPendingEndTurnOrderForUnit(waiter.unitId, batch.atTick)) {
                continue;
            }
            engine.state.orderMgr.applyOrder({
                unitId: waiter.unitId,
                abilityId: 'wait',
                targets: [],
                endTurn: true,
            });
            this.assumedWaitUnitIds.add(waiter.unitId);
        }

        const deferredLabel = findPreviewDeferredSelectLabel(ability, caster, engine);

        const previewOrder: BattleOrder = {
            ...order,
            targets: [],
            targetsByLabel: {},
            endTurn: true,
        };

        if (deferredLabel != null) {
            // Cast cannot start until the first target is known (t=0 select or windup lunge).
            engine.signalWaitingForTarget(deferredLabel, unitId, abilityId);
            engine.isPaused = true;
            this._currentLabel = deferredLabel;
            logItsPreviewStarted(session, this, {
                batchAtTick: batch.atTick,
                deferredFirstLabel: deferredLabel,
            });
            return true;
        }

        // Queue the preview order. Spread the original order so movePath/moveTargetUnitId/moveTargetPixel
        // take effect during the preview windup — the caster slides toward the
        // intended destination even before targets are confirmed.
        engine.state.orderMgr.applyOrder(previewOrder);
        this._previewOrderQueued = true;
        // applyOrder → onAfterOrderQueued → tryResumeParallel → all ready → engine starts running.
        logItsPreviewStarted(session, this, {
            batchAtTick: batch.atTick,
            deferredFirstLabel: null,
        });
        return true;
    }

    private _buildPreviewOrder(): BattleOrder {
        const movementByLabel = Object.keys(this.collectedMovementByLabel).length > 0
            ? { ...this.collectedMovementByLabel }
            : undefined;
        const useMeleeOverride =
            this._selectLabels.length === 1 && this._orderPositionalTargets.length > 0;
        const targets = useMeleeOverride
            ? this._orderPositionalTargets
            : buildPositionalTargetsFromLabels(this._selectLabels, this.collectedTargets);
        return {
            ...this.originalOrder!,
            targets,
            targetsByLabel: buildTargetsByLabelFromPositional(
                this._selectLabels,
                this.collectedTargets,
                targets,
            ),
            endTurn: true,
            ...(movementByLabel ? { movementByLabel } : {}),
        };
    }

    private _queuePreviewOrder(session: BattleSession): void {
        const engine = session.getEngine();
        if (!engine || !this.originalOrder) return;
        engine.state.orderMgr.applyOrder(this._buildPreviewOrder());
        this._previewOrderQueued = true;
    }

    /**
     * Called by the UI when the player selects a target for `label`.
     * Stores the target, injects it into the live engine's active ability (or queues the
     * deferred preview order for t=0 first-select abilities), and unpauses the engine.
     *
     * @param orderPositionalTargets Full positional array for `order.targets` (e.g. lock-ons + aim
     *   pixel from `buildMeleeSelectOrderTargets`). When provided, replaces the label-derived array
     *   in the preview order, replay, and commit. Omit for non-melee abilities.
     */
    resolveTarget(label: string, target: ResolvedTarget, session: BattleSession, orderPositionalTargets?: ResolvedTarget[]): void {
        if (!this._isActive || !this._unitId || !this._abilityId) return;
        const engine = session.getEngine();
        if (!engine) return;

        this.collectedTargets[label] = target;
        if (orderPositionalTargets != null) {
            this._orderPositionalTargets = orderPositionalTargets;
        }

        if (!this._previewOrderQueued) {
            this._queuePreviewOrder(session);
        } else {
            const caster = engine.getUnit(this._unitId);
            if (caster) {
                const active = caster.activeAbilities.find((a) => a.abilityId === this._abilityId);
                if (active) {
                    // Keep active.targets in sync with lock-ons + aim pixel so MeleeAttack.onSetup
                    // reads the same list the player locked during targeting (not just the label).
                    if (this._orderPositionalTargets.length > 0) {
                        active.targets = this._orderPositionalTargets.map((t) => ({ ...t }));
                    }
                    if (!active.targetsByLabel) active.targetsByLabel = {};
                    const primaryIdx = active.targets.findIndex(
                        (t) => t.type === target.type
                            && (t.type === 'unit'
                                ? t.unitId === (target as { unitId?: string }).unitId
                                : t.position?.x === (target as { position?: { x: number } }).position?.x
                                    && t.position?.y === (target as { position?: { y: number } }).position?.y),
                    );
                    active.targetsByLabel[label] = primaryIdx >= 0
                        ? active.targets[primaryIdx]!
                        : target;
                }
            }
        }

        engine.waitingForTargetInput = null;
        engine.isPaused = false;

        logItsTargetAdded(
            session,
            this,
            label,
            target,
            this.allTargetsCollected(),
        );
    }

    /**
     * Called by the UI when the player right-clicks to re-plan movement while paused for `label`.
     *
     * Only valid while `engine.waitingForTargetInput` is set (i.e. the preview is paused).
     * Stores the movement in `collectedMovementByLabel` (for commit/replay) and on the live
     * cast's `active.movementByLabel` so `unitAbilityTick` applies it when the select interval
     * fires inline — the same pipeline point and `pathfindingTick` as a committed run.
     */
    resolveMovement(label: string, payload: MovementReInput, session: BattleSession): void {
        if (!this._isActive || !this._unitId) return;
        const engine = session.getEngine();
        if (!engine || !engine.waitingForTargetInput) return;

        // Store for commit/replay.
        this.collectedMovementByLabel[label] = { ...payload };

        const caster = engine.getUnit(this._unitId);
        if (!caster) return;
        const active = caster.activeAbilities.find((a) => a.abilityId === this._abilityId);
        if (!active) return;
        if (!active.movementByLabel) active.movementByLabel = {};
        active.movementByLabel[label] = { ...payload };

        // Update unit.movement immediately so PreviewRenderer can draw the path.
        // The engine tick will overwrite this with the same value when it resumes.
        if (payload.movePath.length > 0) {
            caster.setMovement(payload.movePath, payload.moveTargetUnitId, engine.gameTick, payload.moveTargetPixel);
        }
    }

    /**
     * Hold a remote order that arrived while the preview is active.
     * Only the latest order per unitId is kept (replaces earlier ones).
     * `key` is the dedupe key computed by the caller; stored so release can register it
     * in `appliedRemoteOrderKeys` to prevent re-delivery.
     */
    holdRemoteOrder(atTick: number, order: BattleOrder, key: string | null): void {
        this.heldRemoteOrders.set(order.unitId, { atTick, order, key });
    }

    /**
     * Read-only commit-time predicate: in-place when every assumed-wait unit has a held pure pass,
     * no other held rows exist, and a host persistence path is available (non-host in Step 3).
     */
    wouldCommitInPlace(session: BattleSession): boolean {
        if (!this.mark || !this._unitId) return false;

        const batch = this.mark.waitingForOrders;
        if (!batch) return false;

        const engine = session.getEngine();
        const markTick = typeof this.mark.gameTick === 'number' ? this.mark.gameTick : 0;
        if (engine != null && !session.isHost() && engine.gameTick > markTick) {
            // Rollback-only until preview/canon execution equivalence is verified per-ability
            // (lobby 5E0F6B — kept preview timeline diverged from the host's canonical run of
            // the same order); see Step 5 equivalence tests before re-enabling.
            return false;
        }

        const markWaiterIds = new Set(batch.waiters.map((w) => w.unitId));

        if (!session.isInPlaceCommitPersistenceAvailable()) return false;

        for (const [unitId, held] of this.heldRemoteOrders) {
            if (!markWaiterIds.has(unitId)) return false;
            if (!this.assumedWaitUnitIds.has(unitId)) return false;
            if (!isPurePassOrder(held.order)) return false;
        }

        for (const unitId of this.assumedWaitUnitIds) {
            const held = this.heldRemoteOrders.get(unitId);
            if (!held || !isPurePassOrder(held.order)) return false;
        }

        return true;
    }

    /**
     * Abort the preview, restore engine to the mark state, and apply held remote orders.
     */
    async reset(session: BattleSession, actionSource: ItsActionSource = 'ui_reset'): Promise<void> {
        if (!this._isActive) return;
        logItsButtonClick(session, this, actionSource);
        const logSnapshot = this._captureLogSnapshot(session);
        await session.refreshRemoteOrdersBeforeInteractiveTargetingAction();
        this._restoreToMark(session);
        Object.keys(this.collectedTargets).forEach((k) => delete this.collectedTargets[k]);
        this.collectedMovementByLabel = {};
        this._orderPositionalTargets = [];
        this._clearActive();
        logItsPreviewCancelled(session, logSnapshot, 'user_reset');
    }

    /**
     * Abort the session without restoring engine state. Used when the engine is about to
     * be replaced externally (e.g. loadFromSnapshot during resync) — the preview is
     * already invalid, so there is nothing to restore.
     */
    abort(session: BattleSession, cancelReason: ItsCancelReason = 'resync_load_from_snapshot'): void {
        if (!this._isActive) return;
        const logSnapshot = this._captureLogSnapshot(session);
        Object.keys(this.collectedTargets).forEach((k) => delete this.collectedTargets[k]);
        this.collectedMovementByLabel = {};
        this._orderPositionalTargets = [];
        this.heldRemoteOrders.clear();
        this._clearActive();
        logItsPreviewCancelled(session, logSnapshot, cancelReason);
    }

    /**
     * Ends an active preview when victory/defeat latches during playahead.
     * Keeps the live engine state — does not restore the mark snapshot.
     */
    endPreviewForTerminalOutcome(session: BattleSession): void {
        if (!this._isActive) return;
        const logSnapshot = this._captureLogSnapshot(session);
        this.heldRemoteOrders.clear();
        this._clearActive();
        logItsPreviewCancelled(session, logSnapshot, 'terminal_outcome_teardown');
    }

    /**
     * Restore to mark and re-queue the ability order with all targets collected so far
     * pre-filled in `targetsByLabel`, so the engine runs without pausing again.
     */
    async replay(session: BattleSession, actionSource: ItsActionSource = 'ui_replay'): Promise<void> {
        if (!this._abilityId || !this._unitId || !this.originalOrder) return;
        logItsButtonClick(session, this, actionSource);
        const unitId = this._unitId;
        const targets = { ...this.collectedTargets };
        const positionalTargets =
            this._selectLabels.length === 1 && this._orderPositionalTargets.length > 0
                ? [...this._orderPositionalTargets]
                : null;
        const movementByLabel = Object.keys(this.collectedMovementByLabel).length > 0
            ? { ...this.collectedMovementByLabel }
            : undefined;
        const baseOrder = this.originalOrder;

        await session.refreshRemoteOrdersBeforeInteractiveTargetingAction();
        this._restoreToMark(session);

        const engine = session.getEngine();
        if (!engine) return;

        // restoreFromInMemorySnapshot creates a fresh engine (isSequentialTargetingPreview = false
        // and onParallelBatchResolved re-bound to the real callback). Re-raise the flag and
        // suppress the batch callback so the replay run doesn't persist state to the server.
        engine.isSequentialTargetingPreview = true;
        engine.sequentialTargetingPreviewCast = { unitId, abilityId: baseOrder.abilityId, startRound: engine.roundNumber };
        engine.setOnParallelBatchResolved(null);

        // Re-queue wait for other players' units (restore wiped the auto-queued waits from begin()).
        const replayBatch = engine.state.orderMgr.waitingForOrders;
        if (replayBatch) {
            for (const waiter of replayBatch.waiters) {
                if (waiter.unitId !== unitId) {
                    engine.state.orderMgr.applyOrder({
                        unitId: waiter.unitId,
                        abilityId: 'wait',
                        targets: [],
                        endTurn: true,
                    });
                }
            }
        }

        // Re-queue with targets pre-filled — no blocking will occur.
        // Spread originalOrder so movement fields (movePath etc.) are preserved.
        // Include movementByLabel so per-label movement fires at interval entry.
        const replayTargets = positionalTargets
            ?? buildPositionalTargetsFromLabels(this._selectLabels, targets);
        const replayOrder: BattleOrder = {
            ...baseOrder,
            targets: replayTargets,
            targetsByLabel: buildTargetsByLabelFromPositional(this._selectLabels, targets, replayTargets),
            endTurn: true,
            ...(movementByLabel ? { movementByLabel } : {}),
        };
        engine.state.orderMgr.applyOrder(replayOrder);
    }

    /**
     * Rollback: restore to mark, apply held remote orders, submit via BattleNet (re-applies locally).
     * In-place: keep preview engine state, persist the finalized order without re-applying it,
     * clear preview flags, unpause, and re-emit any terminal outcome suppressed during preview.
     *
     * Re-entrant calls while a commit is awaiting network are dropped (terminal-outcome
     * auto-commit can race the UI's AUTO_END_TURN poll).
     */
    async commit(session: BattleSession, actionSource?: ItsActionSource): Promise<void> {
        if (this._commitInFlight) return;
        if (actionSource != null) {
            logItsButtonClick(session, this, actionSource);
        }
        this._commitInFlight = true;
        try {
            await this._commitImpl(session, actionSource);
        } finally {
            this._commitInFlight = false;
        }
    }

    private async _commitImpl(session: BattleSession, actionSource?: ItsActionSource): Promise<void> {
        if (!this._abilityId || !this._unitId || !this.mark || !this.originalOrder) return;

        // --- Phase 1: validate everything BEFORE touching engine or session state ---

        const abilityId = this._abilityId;
        const unitId = this._unitId;
        const markSnapshot = this.mark;

        // atTick must be present in the mark snapshot.
        const markAtTick = markSnapshot.waitingForOrders?.atTick;
        if (markAtTick == null) return;

        // Ability def must exist (guard against a hot-reload removing it mid-preview).
        const ability = getAbility(abilityId);
        if (!ability) return;

        // Caster must be alive in the mark snapshot's unit list.
        const casterInSnapshot = markSnapshot.units.some(
            (u) => (u as { id?: unknown }).id === unitId,
        );
        if (!casterInSnapshot) return;

        await session.refreshRemoteOrdersBeforeInteractiveTargetingAction();

        // Host may advance one batch while non-host preview freezes on gameTick+1 (lobby 8AF2AB).
        let atTick = markAtTick;
        const heartbeatBatch = session.getHeartbeatOrderBatchAtTick();
        if (
            heartbeatBatch != null
            && heartbeatBatch !== markAtTick
            && !session.isOrderBatchTickSubmittable(markAtTick)
            && session.isOrderBatchTickSubmittable(heartbeatBatch)
        ) {
            atTick = heartbeatBatch;
        }

        const batchSubmittable = session.isOrderBatchTickSubmittable(atTick);
        const expectedToAct = session.isLocalPlayerExpectedToAct();
        const wouldInPlace = this.wouldCommitInPlace(session);

        // Mark batch may be stale if the host advanced during preview (lobby F6E500).
        if (!batchSubmittable || !expectedToAct) {
            const logSnapshot = this._captureLogSnapshot(session);
            const heldForAbort = [...this.heldRemoteOrders.values()];
            this.heldRemoteOrders.clear();
            this._restoreToMark(session, { applyHeldRemoteOrders: false });
            session.applyHeldRemoteOrders(heldForAbort);
            this._clearActive();
            session.emitOrderSubmitFailed(unitId, abilityId);
            logItsPreviewEnded(session, logSnapshot, 'rejected', 'stale_batch', {
                atTick,
                batchSubmittable,
                expectedToAct,
                actionSource: actionSource ?? null,
            });
            return;
        }

        const collected = { ...this.collectedTargets };
        const selectLabels = [...this._selectLabels];
        const movementByLabel = Object.keys(this.collectedMovementByLabel).length > 0
            ? { ...this.collectedMovementByLabel }
            : undefined;
        const positionalTargetsOverride =
            selectLabels.length === 1 && this._orderPositionalTargets.length > 0
                ? [...this._orderPositionalTargets]
                : undefined;
        const baseOrder = this.originalOrder;
        const inPlace = wouldInPlace;
        const heldRows = [...this.heldRemoteOrders.values()];
        this.heldRemoteOrders.clear();

        const realOrder = buildFinalizedSequentialTargetingOrder(
            selectLabels,
            collected,
            baseOrder,
            movementByLabel,
            positionalTargetsOverride,
        );

        if (inPlace) {
            this._registerHeldPurePassDedupeKeys(session, heldRows);
            await this._commitInPlace(session, {
                realOrder,
                atTick,
                unitId,
                abilityId,
                logSnapshot: this._captureLogSnapshot(session),
                actionSource,
            });
            return;
        }

        const rollbackLogSnapshot = this._captureLogSnapshot(session);

        // --- Phase 2 (rollback): restore, clear, release, submit ---

        this._restoreToMark(session, { applyHeldRemoteOrders: false });
        this._clearActive();

        const engine = session.getEngine();
        if (!engine) return;

        // Drop any stale pending row for this unit at the batch tick before submitting.
        engine.pendingOrders = engine.pendingOrders.filter(
            (o) => !(o.gameTick === atTick && o.order.unitId === unitId),
        );

        session.applyHeldRemoteOrders(heldRows);

        const landed = await session.submitCommittedTargetingOrder(realOrder, atTick);

        // --- Phase 3: verify the order actually landed ---
        if (!landed) {
            session.emitOrderSubmitFailed(unitId, abilityId);
            logItsPreviewEnded(session, rollbackLogSnapshot, 'rejected', 'submit_failed', {
                atTick,
                commitMode: 'rollback',
                actionSource: actionSource ?? null,
            });
            return;
        }
        logItsPreviewEnded(session, rollbackLogSnapshot, 'submitted', 'rollback', {
            atTick,
            commitMode: 'rollback',
            actionSource: actionSource ?? null,
        });
    }

    private async _commitInPlace(
        session: BattleSession,
        ctx: {
            realOrder: BattleOrder;
            atTick: number;
            unitId: string;
            abilityId: string;
            logSnapshot: ItsLogSnapshot;
            actionSource?: ItsActionSource;
        },
    ): Promise<void> {
        const { realOrder, atTick, unitId, abilityId, logSnapshot, actionSource } = ctx;

        const persisted = await session.persistInPlaceCommittedTargetingOrder(realOrder, atTick);
        if (!persisted) {
            session.emitOrderSubmitFailed(unitId, abilityId);
            logItsPreviewEnded(session, logSnapshot, 'rejected', 'persist_failed', {
                atTick,
                commitMode: 'in_place',
                actionSource: actionSource ?? null,
            });
            return;
        }

        const engine = session.getEngine();
        if (!engine) return;

        const preserveConditionalCancelPause = isPreviewCastConditionalCancelPaused(engine);

        engine.isSequentialTargetingPreview = false;
        engine.sequentialTargetingPreviewCast = null;
        engine.waitingForTargetInput = null;
        if (!preserveConditionalCancelPause) {
            engine.isPaused = false;
        }

        session.rebindEngineCallbacks();

        this._clearActive();

        if (preserveConditionalCancelPause) {
            session.emitWaitingForOrdersIfPaused();
        }

        session.reemitSuppressedTerminalOutcome(engine);

        logItsPreviewEnded(session, logSnapshot, 'submitted', 'in_place', {
            atTick,
            commitMode: 'in_place',
            actionSource: actionSource ?? null,
        });
    }

    /** Register dedupe keys for held pure-pass rows without re-queueing (assumed wait already ran). */
    private _registerHeldPurePassDedupeKeys(session: BattleSession, heldRows: HeldRemoteOrder[]): void {
        const keys: string[] = [];
        for (const { order, key } of heldRows) {
            if (!isPurePassOrder(order)) continue;
            if (key != null) keys.push(key);
        }
        if (keys.length > 0) {
            session.seedRemoteOrderDedupeKeys(keys);
        }
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Restore engine to `mark` state and apply all held remote orders.
     * The saved `onParallelBatchResolved` callback is restored on the new engine.
     */
    private _restoreToMark(
        session: BattleSession,
        opts?: { applyHeldRemoteOrders?: boolean },
    ): void {
        if (!this.mark) return;
        // Capture-frame signal for the DOM rewind overlay (must fire before engine teardown).
        session.emitSequentialTargetingRewind();
        session.restoreFromInMemorySnapshot(this.mark);
        const applyHeld = opts?.applyHeldRemoteOrders !== false;
        if (applyHeld) {
            const rows = [...this.heldRemoteOrders.values()];
            this.heldRemoteOrders.clear();
            session.applyHeldRemoteOrders(rows);
        }
        // Re-bind the saved callback (was set to null; restoreFromInMemorySnapshot re-binds
        // via bindEngineCallbacks → setOnParallelBatchResolved, so nothing to do here).
    }

    private _captureLogSnapshot(session: BattleSession): ItsLogSnapshot {
        return captureItsLogSnapshot(this, session, this.mark?.waitingForOrders?.atTick);
    }

    private _clearActive(): void {
        this._isActive = false;
        this._abilityId = null;
        this._unitId = null;
        this._currentLabel = null;
        this._selectLabels = [];
        this.mark = null;
        this.originalOrder = null;
        this._previewOrderQueued = false;
        this.assumedWaitUnitIds = new Set();
    }
}
