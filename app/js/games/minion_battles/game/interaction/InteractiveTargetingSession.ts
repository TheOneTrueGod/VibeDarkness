/**
 * InteractiveTargetingSession — manages the local-preview engine run for
 * abilities that use SelectTargetDef (e.g. Double Punch).
 *
 * Flow:
 *   1. begin()      — snapshot engine state, swap onParallelBatchResolved to no-op,
 *                     queue a preview order with targetsByLabel: {}, start the engine.
 *   2. resolveTarget() — called by UI when the player clicks a target; unpauses engine.
 *   3. reset()      — restore to mark, discard collected targets.
 *   4. replay()     — restore to mark, re-queue order with all collected targets pre-filled.
 *   5. commit()     — restore to mark, apply held remote orders, submit real order via BattleNet.
 */

import type { BattleOrder, ResolvedTarget, SerializedGameState } from '../types';
import type { BattleSession } from '../BattleSession';

/** Minimal info held for one deferred remote order row. */
interface HeldRemoteOrder {
    atTick: number;
    order: BattleOrder;
}

export class InteractiveTargetingSession {
    private _isActive = false;
    private mark: SerializedGameState | null = null;
    private _abilityId: string | null = null;
    private _unitId: string | null = null;
    /** Targets collected so far, keyed by SelectTargetDef label. */
    readonly collectedTargets: Record<string, ResolvedTarget> = {};
    /** Remote orders that arrived while preview is active; held until preview ends. */
    private heldRemoteOrders: Map<string, HeldRemoteOrder> = new Map();
    /** The label currently waiting for player input (set externally by UI). */
    private _currentLabel: string | null = null;
    /** Saved onParallelBatchResolved callback, replaced with no-op during preview. */
    private savedOnParallelBatchResolved: ((batchAtTick: number) => void | Promise<void>) | null = null;

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
     * - Replaces `onParallelBatchResolved` with a no-op so the host does not
     *   try to persist the preview run.
     * - Queues a preview order with `targetsByLabel: {}` (the sentinel that
     *   enables Pass A blocking in unitAbilityTick).
     * - `tryResumeParallel` is triggered automatically by applyOrder.
     */
    begin(abilityId: string, unitId: string, session: BattleSession): void {
        const engine = session.getEngine();
        if (!engine) return;

        this._isActive = true;
        this._abilityId = abilityId;
        this._unitId = unitId;
        // Clear any leftover state from a previous session.
        Object.keys(this.collectedTargets).forEach((k) => delete this.collectedTargets[k]);
        this.heldRemoteOrders.clear();
        this._currentLabel = null;

        // Snapshot the pause state.
        this.mark = engine.toJSON();

        // Swap out onParallelBatchResolved with a no-op for the duration of the preview.
        // We save the original so we can restore it after commit/reset/replay.
        // Access via the public setter.
        this.savedOnParallelBatchResolved = null; // GameEngine doesn't expose a getter, so we just set to null on restore.
        engine.setOnParallelBatchResolved(null);

        // Queue the preview order. `targetsByLabel: {}` is the sentinel that
        // tells Pass A in unitAbilityTick to activate blocking.
        const previewOrder: BattleOrder = {
            unitId,
            abilityId,
            targets: [],
            targetsByLabel: {},
            endTurn: true,
        };
        engine.state.orderMgr.applyOrder(previewOrder);
        // applyOrder → onAfterOrderQueued → tryResumeParallel → engine starts running.
    }

    /**
     * Called by the UI when the player selects a target for `label`.
     * Stores the target, injects it into the live engine's active ability,
     * and unpauses the engine so it can continue to the next SelectTargetDef.
     */
    resolveTarget(label: string, target: ResolvedTarget, session: BattleSession): void {
        if (!this._isActive || !this._unitId || !this._abilityId) return;
        const engine = session.getEngine();
        if (!engine) return;

        // Store in collection.
        this.collectedTargets[label] = target;

        // Inject into the live engine's active ability so Pass B can fire the deferred interval.
        const caster = engine.getUnit(this._unitId);
        if (caster) {
            const active = caster.activeAbilities.find((a) => a.abilityId === this._abilityId);
            if (active) {
                if (!active.targetsByLabel) active.targetsByLabel = {};
                active.targetsByLabel[label] = target;
            }
        }

        // Clear the waiting signal and unpause.
        engine.waitingForTargetInput = null;
        engine.isPaused = false;
    }

    /**
     * Hold a remote order that arrived while the preview is active.
     * Only the latest order per unitId is kept (replaces earlier ones).
     */
    holdRemoteOrder(atTick: number, order: BattleOrder): void {
        this.heldRemoteOrders.set(order.unitId, { atTick, order });
    }

    /**
     * Abort the preview, restore engine to the mark state, and apply held remote orders.
     */
    reset(session: BattleSession): void {
        this._restoreToMark(session);
        Object.keys(this.collectedTargets).forEach((k) => delete this.collectedTargets[k]);
        this._clearActive();
    }

    /**
     * Abort the session without restoring engine state. Used when the engine is about to
     * be replaced externally (e.g. loadFromSnapshot during resync) — the preview is
     * already invalid, so there is nothing to restore.
     */
    abort(): void {
        this._clearActive();
        Object.keys(this.collectedTargets).forEach((k) => delete this.collectedTargets[k]);
        this.heldRemoteOrders.clear();
    }

    /**
     * Restore to mark and re-queue the ability order with all targets collected so far
     * pre-filled in `targetsByLabel`, so the engine runs without pausing again.
     */
    replay(session: BattleSession): void {
        if (!this._abilityId || !this._unitId) return;
        const abilityId = this._abilityId;
        const unitId = this._unitId;
        const targets = { ...this.collectedTargets };

        this._restoreToMark(session);

        const engine = session.getEngine();
        if (!engine) return;

        // Re-queue with targets pre-filled — no blocking will occur.
        const replayOrder: BattleOrder = {
            unitId,
            abilityId,
            targets: [],
            targetsByLabel: targets,
            endTurn: true,
        };
        engine.state.orderMgr.applyOrder(replayOrder);
    }

    /**
     * Restore to mark, apply held remote orders, then submit the real order via BattleNet.
     */
    commit(session: BattleSession): void {
        if (!this._abilityId || !this._unitId || !this.mark) return;
        const abilityId = this._abilityId;
        const unitId = this._unitId;
        const targets = { ...this.collectedTargets };
        const markSnapshot = this.mark;

        this._restoreToMark(session);
        this._clearActive();

        // Submit the real order via BattleNet.
        const atTick = markSnapshot.waitingForOrders?.atTick;
        if (atTick == null) return;

        const realOrder: BattleOrder = {
            unitId,
            abilityId,
            targets: [],
            targetsByLabel: targets,
            endTurn: true,
        };

        // Use the internal netAdapter via the session (accessed indirectly through submitPlayerOrder).
        // We bypass the feature-flag routing in submitPlayerOrder by calling netAdapter directly.
        void (session as unknown as { netAdapter: { submitOrder(o: BattleOrder, t: number): Promise<void> } | null }).netAdapter?.submitOrder(realOrder, atTick);
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Restore engine to `mark` state and apply all held remote orders.
     * The saved `onParallelBatchResolved` callback is restored on the new engine.
     */
    private _restoreToMark(session: BattleSession): void {
        if (!this.mark) return;
        session.restoreFromInMemorySnapshot(this.mark);
        // Apply any remote orders that arrived while preview was active.
        const engine = session.getEngine();
        if (engine) {
            for (const { atTick, order } of this.heldRemoteOrders.values()) {
                engine.state.orderMgr.queueOrder(atTick, order);
            }
            if (this.heldRemoteOrders.size > 0) {
                engine.tryResumeParallel();
            }
        }
        this.heldRemoteOrders.clear();
        // Re-bind the saved callback (was set to null; restoreFromInMemorySnapshot re-binds
        // via bindEngineCallbacks → setOnParallelBatchResolved, so nothing to do here).
    }

    private _clearActive(): void {
        this._isActive = false;
        this._abilityId = null;
        this._unitId = null;
        this._currentLabel = null;
        this.mark = null;
    }
}
