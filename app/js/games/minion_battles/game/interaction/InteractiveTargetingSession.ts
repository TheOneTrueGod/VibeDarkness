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

import type { BattleOrder, OrderAtTick, ResolvedTarget, SerializedGameState } from '../types';
import type { BattleSession } from '../BattleSession';
import type { GameEngine } from '../GameEngine';
import type { KnockbackSource } from '../units/unitTypes';
import {
    type ItsActionSource,
    type ItsCancelReason,
    type ItsLogSnapshot,
    captureItsLogSnapshot,
    logItsButtonClick,
    logItsMovementReinput,
    logItsPreviewCancelled,
    logItsResetPausePlane,
    logItsTargetAdded,
} from './itsLobbyLog';
import {
    type HeldRemoteOrder,
    type MovementReInput,
    buildPositionalTargetsFromLabels,
    buildTargetsByLabelFromPositional,
} from './itsOrderBuilders';
import { itsBegin, itsBeginResume, itsReplay } from './itsBegin';
import { itsCommitImpl, itsRestoreToMark } from './itsCommit';

export {
    type MovementReInput,
    type HeldRemoteOrder,
    isPurePassOrder,
    buildPositionalTargetsFromLabels,
    buildFinalizedSequentialTargetingOrder,
} from './itsOrderBuilders';

export class InteractiveTargetingSession {
    _isActive = false;
    mark: SerializedGameState | null = null;
    _abilityId: string | null = null;
    _unitId: string | null = null;
    /** The original full order that triggered the preview (carries movePath etc.). */
    originalOrder: BattleOrder | null = null;
    /** Targets collected so far, keyed by SelectTargetDef label. */
    readonly collectedTargets: Record<string, ResolvedTarget> = {};
    /** Movement re-inputs collected via resolveMovement(), keyed by SelectTargetDef label. */
    collectedMovementByLabel: Record<string, MovementReInput> = {};
    /** Full positional targets array (lock-ons + aim pixel) supplied by UI on resolveTarget; empty for non-melee abilities. */
    _orderPositionalTargets: ResolvedTarget[] = [];
    /** Remote orders that arrived while preview is active; held until preview ends. */
    heldRemoteOrders: Map<string, HeldRemoteOrder> = new Map();
    /** The label currently waiting for player input (set externally by UI). */
    _currentLabel: string | null = null;
    /** SelectTargetDef labels frozen at begin() — used for all-collected checks and commit mapping. */
    _selectLabels: readonly string[] = [];
    /** False until the preview order is queued (deferred for t=0 first-select abilities). */
    _previewOrderQueued = false;
    /**
     * True when this run started at a missing-pick pause ({@link beginResume}). The preview "order" is then
     * an `updateTargets` order filling picks on the paused cast, not a cast of its own.
     */
    _resumeMode = false;
    /** `startTime` of the paused cast a resume run continues (null outside resume mode). */
    _resumeCastStartTime: number | null = null;
    /** Other batch waiters that received an assumed wait at begin() (not already confirmed). */
    assumedWaitUnitIds: Set<string> = new Set();
    /**
     * True when another player's orders could invalidate the preview timeline (assumed wait at
     * begin/replay, or a parallel pause involving another player during playahead). Forces rollback.
     */
    assumedRemoteWaitDuringPreview = false;
    /** True while a commit is running (guards re-entry from concurrent commit triggers). */
    _commitInFlight = false;
    /** The runId of the current preview (set when entering preview, cleared when exiting). Owned by this ITS. */
    previewRunId: number | null = null;
    /** Diagnostics (lobbies 965D4F / 5F8964): monotonically increasing ITS run + restore counters. */
    diagBeginSeq = 0;
    diagRestoreSeq = 0;
    diagLastRestore: {
        seq: number;
        fromEngineTick: number;
        toEngineTick: number;
        markTick: number | null;
        markBatchAtTick: number | null;
        atMs: number;
    } | null = null;

    /**
     * Compact ITS state attached to order / snapshot / persist lobby-log lines so a server write
     * can be correlated with the preview run (and any rollback) that was in progress.
     */
    getDiagState(): Record<string, unknown> {
        const markTick = this.mark != null && typeof this.mark.gameTick === 'number' ? this.mark.gameTick : null;
        const last = this.diagLastRestore;
        return {
            active: this._isActive,
            beginSeq: this.diagBeginSeq,
            restoreSeq: this.diagRestoreSeq,
            abilityId: this._abilityId,
            unitId: this._unitId,
            markTick,
            markBatchAtTick: this.mark?.waitingForOrders?.atTick ?? null,
            previewOrderQueued: this._previewOrderQueued,
            assumedRemoteWait: this.assumedRemoteWaitDuringPreview,
            heldRemoteCount: this.heldRemoteOrders.size,
            commitInFlight: this._commitInFlight,
            lastRestore:
                last == null
                    ? null
                    : {
                          seq: last.seq,
                          fromEngineTick: last.fromEngineTick,
                          toEngineTick: last.toEngineTick,
                          markTick: last.markTick,
                          markBatchAtTick: last.markBatchAtTick,
                          msAgo: Date.now() - last.atMs,
                      },
        };
    }

    // -------------------------------------------------------------------------
    // Public state
    // -------------------------------------------------------------------------

    get isActive(): boolean {
        return this._isActive;
    }

    /**
     * True while {@link commit} is running (validating, awaiting the network, applying). Cleared
     * in a `finally`, so it drops on every success, rejection, failure and early return.
     */
    get isCommitInFlight(): boolean {
        return this._commitInFlight;
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

    /** True while the run started at a missing-pick pause ({@link beginResume}). */
    get isResumeMode(): boolean {
        return this._isActive && this._resumeMode;
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

    /**
     * Describes how the preview cast ended early (interrupt, fizzle or caster death), or null when
     * it has not (or ITS is inactive / the preview order is not queued yet). An ended-early preview
     * is NOT rewound (lobby 0AD6EA / 3B8D37): it plays forward to the ended-early stop point
     * ({@link getEndedEarlyPreviewStop}), then the player can Undo or commit that timeline. Picks the
     * cast never reached are committed as `missingSelectLabels`.
     *
     * Reads `engine.sequentialTargetingPreviewCast.endedEarly` (recorded from the `cast_ended_early`
     * event), or a dead caster.
     */
    getPreviewCastEndedEarly(engine: GameEngine): {
        reason: 'interrupted' | 'fizzled' | 'caster_died';
        atTick: number | null;
        source?: KnockbackSource;
    } | null {
        if (!this._isActive || !this._previewOrderQueued) return null;
        const cast = engine.sequentialTargetingPreviewCast;
        if (cast == null) return null;
        const endedEarly = cast.endedEarly;
        if (endedEarly != null) {
            return {
                reason: endedEarly.reason,
                atTick: endedEarly.atTick,
                ...(endedEarly.source != null ? { source: endedEarly.source } : {}),
            };
        }
        const caster = engine.getUnit(cast.unitId);
        if (!caster?.isAlive()) {
            return { reason: 'caster_died', atTick: null };
        }
        return null;
    }

    /** Whether a preview cast order has been queued for this ITS run. */
    get previewOrderQueued(): boolean {
        return this._previewOrderQueued;
    }

    /**
     * True when playahead assumed another waiter's order (or noted multiplayer uncertainty).
     * Affects in-place vs rollback commit.
     */
    get hasAssumedRemoteWaitDuringPreview(): boolean {
        return this.assumedRemoteWaitDuringPreview;
    }

    /**
     * True when this preview skipped another player's real order (assumed pass at begin,
     * dropped their later parallel pause, or held a remote row). Combo / Entombed follow-up
     * must not submit on this timeline — Done / Auto End commits throw 1 only (rollback).
     */
    shouldForceItsCommitAtComboWindow(): boolean {
        return this._isActive && (this.assumedRemoteWaitDuringPreview || this.heldRemoteOrders.size > 0);
    }

    /**
     * Marks that playahead crossed a multiplayer order boundary (another player's action could
     * change the canonical path). Wired from {@link GameEngine}'s ITS parallel-pause callback.
     * @returns true when the flag was newly set (first uncertainty this preview).
     */
    noteMultiplayerUncertaintyDuringPreview(): boolean {
        if (!this._isActive || this.assumedRemoteWaitDuringPreview) {
            return false;
        }
        this.assumedRemoteWaitDuringPreview = true;
        return true;
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
        return itsBegin(this, order, session);
    }

    /**
     * Resume mode: start a preview at a missing-pick pause (the way a Combo follow-up preview starts at a
     * conditional-cancel pause). The unit's running cast has `awaitingPickLabel`; the cursor appears for that
     * pick immediately (no ticks run first). The first pick queues a preview `updateTargets` order for the
     * batch tick; later missing picks are collected through the normal local lookahead while the rest of the
     * cast plays ahead. Done sends one `updateTargets` order. Undo ({@link reset}) returns to the pause.
     * Pass is not handled here: the UI resets and submits `wait` (fizzle).
     *
     * @returns false when the preconditions fail (no waiter / no awaiting cast / stale batch / not our turn).
     */
    beginResume(unitId: string, session: BattleSession): boolean {
        return itsBeginResume(this, unitId, session);
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
            // Resume mode: an empty list clears the cast's remaining missing labels, so later picks use the
            // local lookahead (`targetsByLabel` is defined once this update applies).
            ...(this._resumeMode ? { missingSelectLabels: [] } : {}),
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
     * cast's `active.movementByLabel` when the cast has already started.
     *
     * Non-lunge: applied when the select interval fires.
     * Lunge: held through windup/strike and applied (repathed) when cooldown begins.
     *
     * Always updates `unit.movement` for the ghost path preview — including deferred
     * pre-cast pauses where no active ability exists yet.
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
        if (active) {
            if (!active.movementByLabel) active.movementByLabel = {};
            active.movementByLabel[label] = { ...payload };
        }

        // Ghost path for PreviewRenderer (deferred lunge pauses have no active cast yet).
        if (payload.movePath.length > 0) {
            caster.setMovement(payload.movePath, payload.moveTargetUnitId, engine.gameTick, payload.moveTargetPixel);
        }

        logItsMovementReinput(
            session,
            this,
            label,
            payload.movePath.length,
            payload.moveTargetPixel != null,
        );
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

    /** Pending remote rows held during preview (for UI order-status indicators). */
    getHeldRemoteOrderRows(): OrderAtTick[] {
        return [...this.heldRemoteOrders.values()].map(({ atTick, order }) => ({
            gameTick: atTick,
            order,
        }));
    }

    /**
     * Saved mark-batch pause plane + merged pending orders for timeline player indicators
     * while local ITS playahead is active.
     */
    getMarkOrderContextForUi(): {
        waitingForOrders: SerializedGameState['waitingForOrders'];
        pendingOrders: OrderAtTick[];
    } {
        const mark = this.mark;
        if (!mark) {
            return { waitingForOrders: null, pendingOrders: [] };
        }
        const markOrders = mark.orders ?? [];
        const held = this.getHeldRemoteOrderRows();
        const byUnitId = new Map<string, OrderAtTick>();
        for (const row of markOrders) {
            byUnitId.set(row.order.unitId, row);
        }
        for (const row of held) {
            byUnitId.set(row.order.unitId, row);
        }
        return {
            waitingForOrders: mark.waitingForOrders ?? null,
            pendingOrders: [...byUnitId.values()],
        };
    }

    /**
     * Read-only commit-time predicate: in-place when preview did not depend on another player's
     * orders (no assumed waits, no other-player parallel pause during playahead), no held remote
     * rows exist, and a persistence path is available (non-host playahead past mark still forces
     * rollback-only).
     */
    wouldCommitInPlace(session: BattleSession): boolean {
        if (!this.mark || !this._unitId) return false;

        if (this.assumedRemoteWaitDuringPreview) return false;

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

        if (!session.isInPlaceCommitPersistenceAvailable()) return false;

        if (this.heldRemoteOrders.size > 0) return false;

        return true;
    }

    /**
     * Abort the preview, restore engine to the mark state, and apply held remote orders.
     */
    async reset(
        session: BattleSession,
        actionSource: ItsActionSource = 'ui_reset',
        cancelReason: ItsCancelReason = 'user_reset',
    ): Promise<void> {
        if (!this._isActive) return;
        logItsButtonClick(session, this, actionSource);
        logItsResetPausePlane(session, this, 'before_restore', actionSource);
        const logSnapshot = this._captureLogSnapshot(session);
        await session.refreshRemoteOrdersBeforeInteractiveTargetingAction();
        await this._restoreToMark(session);
        logItsResetPausePlane(session, this, 'after_restore', actionSource);
        Object.keys(this.collectedTargets).forEach((k) => delete this.collectedTargets[k]);
        this.collectedMovementByLabel = {};
        this._orderPositionalTargets = [];
        this._clearActive(session);
        logItsPreviewCancelled(session, logSnapshot, cancelReason);
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
        // Discard preview timeline before clearing active (engine about to be replaced).
        if (this.previewRunId !== null) {
            const timeline = session.getTimeline?.();
            if (timeline?.kind === 'preview') {
                session.discardPreview(this.previewRunId);
            }
        }
        this._clearActive(session);
        logItsPreviewCancelled(session, logSnapshot, cancelReason);
    }

    /**
     * Ends an active preview when victory/defeat latches during playahead.
     * Keeps the live engine state — does not restore the mark snapshot.
     * This exits the preview timeline without restoring, leaving the engine at its live tick.
     */
    endPreviewForTerminalOutcome(session: BattleSession): void {
        if (!this._isActive) return;
        const logSnapshot = this._captureLogSnapshot(session);
        this.heldRemoteOrders.clear();
        // Promote preview timeline to canonical without restoring mark (engine stays live at the tick where victory/defeat latched).
        if (this.previewRunId !== null) {
            const timeline = session.getTimeline?.();
            if (timeline?.kind === 'preview') {
                // Promote flushes the buffer so the terminal outcome on the live tick is recorded.
                session.promotePreview(this.previewRunId);
            }
        }
        this._clearActive(session);
        logItsPreviewCancelled(session, logSnapshot, 'terminal_outcome_teardown');
    }

    /**
     * Restore to mark and re-queue the ability order with all targets collected so far
     * pre-filled in `targetsByLabel`, so the engine runs without pausing again.
     */
    async replay(session: BattleSession, actionSource: ItsActionSource = 'ui_replay'): Promise<void> {
        return itsReplay(this, session, actionSource);
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

    async _commitImpl(session: BattleSession, actionSource?: ItsActionSource): Promise<void> {
        return itsCommitImpl(this, session, actionSource);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Restore engine to `mark` state, wait for the rewind crossfade (when the UI defers it),
     * then apply held remote orders. Held-order / replay resume stays gated until presentation ends.
     */
    async _restoreToMark(
        session: BattleSession,
        opts?: { applyHeldRemoteOrders?: boolean },
    ): Promise<void> {
        return itsRestoreToMark(this, session, opts);
    }

    _captureLogSnapshot(session: BattleSession): ItsLogSnapshot {
        return captureItsLogSnapshot(this, session, this.mark?.waitingForOrders?.atTick);
    }

    _clearActive(session?: BattleSession): void {
        // Enforce invariant: timeline must be canonical when clearing active (no preview should be orphaned).
        // This is a safety check that must pass if all exit paths properly call promote/discard.
        // If previewRunId is set, it means an exit path failed to call promote/discard; use the session's
        // current timeline.runId as a fallback (the safety net, not the owned runId).
        if (session && this.previewRunId !== null) {
            const timeline = session.getTimeline?.();
            if (timeline?.kind === 'preview') {
                // Force to canonical to ensure we don't strand a preview timeline.
                // Use timeline.runId (not previewRunId) since we're a safety net cleaning up after an error.
                session.discardPreview(timeline.runId);
                session.postBattleSyncLobbyLog('diag: ITS _clearActive forced preview timeline to canonical (safety net)', {
                    previewRunId: this.previewRunId,
                    timelineRunId: timeline.runId,
                });
            }
        }
        this._isActive = false;
        this._abilityId = null;
        this._unitId = null;
        this._currentLabel = null;
        this._selectLabels = [];
        this.mark = null;
        this.originalOrder = null;
        this._previewOrderQueued = false;
        this._resumeMode = false;
        this._resumeCastStartTime = null;
        this.previewRunId = null;
        this.assumedWaitUnitIds = new Set();
        this.assumedRemoteWaitDuringPreview = false;
    }
}
