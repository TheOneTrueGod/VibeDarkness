/**
 * Parallel order-pause logic for `GameEngine`, moved out of the class as a pure move.
 *
 * A pause is formed in two stages. During a tick, units (or the post-unit scheduling step) record a
 * `deferredOrderPause` on the engine; right after `TICK_END` for that tick,
 * {@link OrderPauseController.commitDeferredOrderPauseAfterCompletedTick} turns it into
 * `waitingForOrders`. {@link OrderPauseController.tryResumeParallel} clears it once every waiter has an order.
 *
 * Ownership: `deferredOrderPause`, the callbacks and the per-tick completion set stay on `GameEngine`
 * (tests and `BattleSession` reach them there; `fromJSON` resets `deferredOrderPause`). This class owns only
 * `droppedItsPreviewPause`, which is ephemeral and never serialized. See `game-sync-data-flow` for the
 * networked side.
 */

import { getAbility } from '../../abilities/AbilityRegistry';
import {
    elapsedIsInCoopCooldown,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../../abilities/abilityTimings';
import { getCastElapsed } from '../time/actorClock';
import type { OrderWaiter } from '../types';
import type { Unit } from '../units/Unit';
import type { GameEngine } from '../GameEngine';

export class OrderPauseController {
    /**
     * Parallel pause the ITS preview dropped during the current tick (host/solo playahead), kept so an
     * in-place commit at that tick can form it exactly as a canonical run would. Cleared each tick.
     * See {@link commitDroppedItsPreviewPauseForStopTick}.
     */
    private droppedItsPreviewPause: {
        gameTick: number;
        waiters: OrderWaiter[];
        naturalCompletionUnitIds: readonly string[];
    } | null = null;

    constructor(private readonly engine: GameEngine) {}

    /** Called once per normal tick, before the units run (the preview drop only lives for one tick). */
    clearDroppedItsPreviewPause(): void {
        this.droppedItsPreviewPause = null;
    }

    /** True when any parallel-order waiter is owned by {@link localPlayerId}. */
    private deferredPauseIncludesLocalPlayer(waiters: readonly OrderWaiter[]): boolean {
        return waiters.some((w) => w.ownerId === this.engine.localPlayerId);
    }

    /** True when any waiter unit has an active ability awaiting a conditional-cancel decision. */
    private waitersIncludeConditionalCancelPause(waiters: readonly OrderWaiter[]): boolean {
        return waiters.some(
            (w) => this.engine.getUnit(w.unitId)?.activeAbilities.some((a) => a.conditionalCancelPaused) ?? false,
        );
    }

    /** True when any waiter unit has an active ability paused at a missing pick (`awaitingPickLabel`). */
    private waitersIncludeMissingPickPause(waiters: readonly OrderWaiter[]): boolean {
        return waiters.some((w) => this.waiterHasMissingPickPause(w));
    }

    private waiterHasMissingPickPause(waiter: OrderWaiter): boolean {
        return this.engine.getUnit(waiter.unitId)?.activeAbilities.some((a) => a.awaitingPickLabel !== undefined) ?? false;
    }

    /**
     * If `engine.deferredOrderPause` was set during the tick that just completed, commit `waitingForOrders`,
     * notify UI, and fire `onCheckpoint` — same `fixedUpdate` pass as `TICK_END` for that tick.
     *
     * @returns true when a parallel order pause was committed (caller returns from `fixedUpdate` after emitting tick tail).
     */
    commitDeferredOrderPauseAfterCompletedTick(): boolean {
        const { engine } = this;
        if (engine.deferredOrderPause == null || engine.deferredOrderPause.waiters.length === 0) {
            return false;
        }
        // Interactive targeting preview: a missing-pick waiter is always dropped, on host and non-host
        // (automatic pass-and-fizzle, so the previewing player's playahead keeps moving). Clearing
        // `awaitingPickLabel` leaves the label in `missingSelectLabels`, so the select fizzles the cast
        // on entry next tick. The hook always marks the preview as depending on another player, so the
        // commit rewinds and the real timeline asks the owner for the real pick. This deliberately
        // bypasses the non-host freeze rule (lobby 39E984): the forced rollback is what prevents the
        // sim from running past the host's order batch and deadlocking on submit.
        if (engine.isSequentialTargetingPreview) {
            const missingPickWaiters = engine.deferredOrderPause.waiters.filter((w) =>
                this.waiterHasMissingPickPause(w),
            );
            if (missingPickWaiters.length > 0) {
                for (const w of missingPickWaiters) {
                    for (const cast of engine.getUnit(w.unitId)?.activeAbilities ?? []) {
                        delete cast.awaitingPickLabel;
                    }
                }
                engine.onItsParallelPauseDecision?.('drop', missingPickWaiters, engine.gameTick, { missingPick: true });
                const remaining = engine.deferredOrderPause.waiters.filter(
                    (w) => !missingPickWaiters.some((m) => m.unitId === w.unitId),
                );
                if (remaining.length === 0) {
                    engine.deferredOrderPause = null;
                    return false;
                }
                engine.deferredOrderPause.waiters = remaining;
            }
        }
        const previewWaiters = engine.deferredOrderPause.waiters;
        const isConditionalCancelPause = this.waitersIncludeConditionalCancelPause(previewWaiters);
        // Interactive targeting preview: ally-only pauses are always dropped so SelectTargetDef
        // intervals can run. On non-host (`freezeItsOnLocalPlayerParallelPause`), pauses that include
        // the local player must freeze (lobby 39E984) — otherwise the sim runs past the host's order
        // batch and deadlocks on submit. Host/solo keep legacy ITS playahead.
        // Conditional cancel still commits the parallel pause; ITS session ends at commit() after Done.
        if (engine.isSequentialTargetingPreview && !isConditionalCancelPause) {
            const freezeLocal =
                engine.freezeItsOnLocalPlayerParallelPause &&
                this.deferredPauseIncludesLocalPlayer(previewWaiters);
            if (!freezeLocal) {
                engine.onItsParallelPauseDecision?.('drop', previewWaiters, engine.gameTick);
                engine.deferredOrderPause = null;
                return false;
            }
            engine.onItsParallelPauseDecision?.('freeze', previewWaiters, engine.gameTick);
        } else if (engine.isSequentialTargetingPreview && isConditionalCancelPause) {
            engine.onItsParallelPauseDecision?.('freeze', previewWaiters, engine.gameTick);
        }
        const { waiters: initialWaiters, naturalCompletionUnitIds } = engine.deferredOrderPause;
        engine.deferredOrderPause = null;
        const atTick = engine.gameTick + 1;

        const naturalSet = new Set(naturalCompletionUnitIds);
        // Conditional cancel is not a natural completion — suppress coop cancel to avoid
        // unrelated team-ability interruptions during a single-unit decision.
        // A missing-pick pause is likewise not a natural completion.
        const isMidCastPause = isConditionalCancelPause || this.waitersIncludeMissingPickPause(initialWaiters);
        const hadNaturalWaiter = !isMidCastPause && initialWaiters.some((w) => naturalSet.has(w.unitId));

        let teamworkCancelledOwnerIds: string[] | undefined;
        let waiters = [...initialWaiters];

        if (hadNaturalWaiter) {
            const initialWaiterUnitIds = new Set(initialWaiters.map((w) => w.unitId));
            const triggerTeamIds = new Set<string>();
            for (const w of initialWaiters) {
                if (!naturalSet.has(w.unitId)) continue;
                const u = engine.getUnit(w.unitId);
                if (u) triggerTeamIds.add(u.teamId);
            }

            const cancelledOwners = new Set<string>();
            for (const unit of engine.units) {
                if (!unit.active || !unit.isAlive()) continue;
                if (!unit.isPlayerControlled()) continue;
                if (initialWaiterUnitIds.has(unit.id)) continue;
                if (!triggerTeamIds.has(unit.teamId)) continue;
                for (const active of [...unit.activeAbilities]) {
                    const ability = getAbility(active.abilityId);
                    if (!ability) continue;
                    const entries = resolveAbilityTimingEntries(ability, unit, engine);
                    const intervals = normalizeAbilityTimingsToIntervals(entries);
                    const elapsed = Math.max(0, getCastElapsed(unit, active, engine));
                    if (elapsedIsInCoopCooldown(elapsed, intervals)) {
                        engine.cancelActiveAbility(unit.id, active.abilityId);
                        cancelledOwners.add(unit.ownerId);
                    }
                }
                // Wait action coop cancel: if the unit is past its min wait time it is in the
                // coop-cancellable window (last 1 s of the 1.5–2.5 s wait duration).
                if (unit.isInWaitLockout() && unit.waitMinEndTime !== null && engine.gameTime >= unit.waitMinEndTime) {
                    unit.waitMinEndTime = null;
                    unit.waitMaxEndTime = null;
                    unit.waitAbilityMode = null;
                    cancelledOwners.add(unit.ownerId);
                }
            }

            if (cancelledOwners.size > 0) {
                teamworkCancelledOwnerIds = [...cancelledOwners].sort();
            }

            const mergedIds = new Set(waiters.map((w) => w.unitId));
            const extras: OrderWaiter[] = [];
            for (const unit of engine.units) {
                if (!unit.active || !unit.isAlive()) continue;
                if (!engine.state.orderMgr.shouldPauseForOrders(unit)) continue;
                if (mergedIds.has(unit.id)) continue;
                mergedIds.add(unit.id);
                extras.push({ unitId: unit.id, ownerId: unit.ownerId });
            }
            extras.sort((a, b) =>
                a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
            );
            waiters = [...waiters, ...extras].sort((a, b) =>
                a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
            );
        }

        engine.waitingForOrders = {
            waiters,
            atTick,
            ...(teamworkCancelledOwnerIds !== undefined ? { teamworkCancelledOwnerIds } : {}),
        };
        engine.isPaused = true;
        engine.snapshotIndex++;
        engine.onWaitingForOrders?.(engine.waitingForOrders);
        engine.onCheckpoint?.(engine.gameTick, engine.toJSON(), [...engine.pendingOrders]);
        return true;
    }

    /**
     * Host in-place ITS commit: the preview stopped at a tick whose parallel pause playahead dropped.
     * A canonical run of the same order commits that pause at the end of this tick (atTick = gameTick + 1),
     * so form it now — otherwise the next `fixedUpdate` collects the waiters one tick late.
     * Call after preview flags are cleared (promotion). No-op when the drop was on an earlier tick.
     *
     * @returns true when a parallel order pause was committed.
     */
    commitDroppedItsPreviewPauseForStopTick(): boolean {
        const { engine } = this;
        const dropped = this.droppedItsPreviewPause;
        this.droppedItsPreviewPause = null;
        if (
            dropped == null
            || dropped.gameTick !== engine.gameTick
            || engine.isSequentialTargetingPreview
            || engine.waitingForOrders != null
            || engine.deferredOrderPause != null
        ) {
            return false;
        }
        engine.state.levelEventManager.runVictoryChecks();
        engine.deferredOrderPause = {
            waiters: dropped.waiters,
            naturalCompletionUnitIds: dropped.naturalCompletionUnitIds,
        };
        return this.commitDeferredOrderPauseAfterCompletedTick();
    }

    /**
     * Unpause only when every frozen waiter has a pending order at the batch tick.
     * Invoked after each `applyOrder` / remote `queueOrder` while paused.
     *
     * Host: when {@link setOnParallelBatchResolved} returns a Promise (or promise-like result),
     * clears the pause only after it settles successfully — merge-applied HTTP uses this path.
     * When the hook returns a non‑thenable (for example undefined with no networked adapter),
     * the pause clears synchronously so headless/engine-only loops remain deterministic.
     * Non-host / no hook: clears synchronously.
     */
    tryResumeParallel(): void {
        const { engine } = this;
        const batch = engine.state.orderMgr.waitingForOrders;
        if (!batch) return;
        const allReady = batch.waiters.every((w: OrderWaiter) => engine.state.orderMgr.hasPendingEndTurnOrderForUnit(w.unitId, batch.atTick));
        if (!allReady) return;

        const unitIds = batch.waiters.map((w: OrderWaiter) => w.unitId).sort();
        const batchAtTick = batch.atTick;
        const pauseBatch = batch;
        const cb = engine.onParallelBatchResolved;
        const finalizeResume = (): void => {
            if (engine.state.orderMgr.waitingForOrders !== pauseBatch) {
                return;
            }
            engine.state.orderMgr.waitingForOrders = null;
            engine.isPaused = false;
            engine.deferredOrderPause = null;
            engine.eventBus.emit('turn_end', { unitIds });
            engine.onStateChanged?.();
        };

        const isPromiseLike = (value: unknown): value is PromiseLike<unknown> => {
            return (
                !!value &&
                (typeof value === 'object' || typeof value === 'function') &&
                typeof (value as PromiseLike<unknown>).then === 'function'
            );
        };

        if (cb != null) {
            let hookResult: unknown;
            try {
                hookResult = cb(batchAtTick);
            } catch (err: unknown) {
                console.error('[GameEngine] onParallelBatchResolved failed', err);
                return;
            }

            if (isPromiseLike(hookResult)) {
                void Promise.resolve(hookResult)
                    .then(() => {
                        finalizeResume();
                    })
                    .catch((err: unknown) => {
                        console.error('[GameEngine] onParallelBatchResolved failed', err);
                        // Stay paused until desync recovery or host retry restores a consistent pause plane.
                    });
                return;
            }

            finalizeResume();
            return;
        }

        finalizeResume();
    }

    /** Shared body: make `unit` a waiter in the deferred order pause committed at the end of this tick. */
    requestMidCastOrderPause(unit: Unit): void {
        const { engine } = this;
        const waiter: OrderWaiter = { unitId: unit.id, ownerId: unit.ownerId };
        if (engine.deferredOrderPause) {
            if (!engine.deferredOrderPause.waiters.some((w) => w.unitId === unit.id)) {
                engine.deferredOrderPause.waiters.push(waiter);
            }
        } else {
            engine.deferredOrderPause = {
                waiters: [waiter],
                naturalCompletionUnitIds: [],
            };
        }
    }

    /**
     * After the units have run this tick: when no pause is already waiting, collect the parallel waiters and either
     * schedule the deferred pause (committed after `TICK_END`) or, for an ITS preview, drop it and remember the drop.
     */
    scheduleParallelPauseAfterUnitTick(): void {
        const { engine } = this;
        if (engine.waitingForOrders == null) {
            const waiters = engine.state.orderMgr.collectParallelWaiters();
            // During ITS: host/solo ignore all parallel pauses (legacy playahead). Non-host only
            // schedules pauses that include the local player (see commitDeferredOrderPause…).
            const schedulePause =
                waiters.length > 0 &&
                (!engine.isSequentialTargetingPreview ||
                    (engine.freezeItsOnLocalPlayerParallelPause &&
                        this.deferredPauseIncludesLocalPlayer(waiters)));
            if (schedulePause) {
                engine.state.levelEventManager.runVictoryChecks();
                // A mid-cast request made earlier this tick (conditional cancel, missing pick) already
                // holds a deferred pause. Merge into it instead of replacing it, or its waiter is lost
                // and the cast stays paused with no order batch to answer it.
                const earlier = engine.deferredOrderPause;
                if (earlier != null) {
                    const merged = [...earlier.waiters];
                    for (const w of waiters) {
                        if (!merged.some((m) => m.unitId === w.unitId)) merged.push(w);
                    }
                    merged.sort((a, b) =>
                        a.ownerId !== b.ownerId
                            ? a.ownerId.localeCompare(b.ownerId)
                            : a.unitId.localeCompare(b.unitId),
                    );
                    engine.deferredOrderPause = {
                        waiters: merged,
                        naturalCompletionUnitIds: [
                            ...new Set([
                                ...earlier.naturalCompletionUnitIds,
                                ...engine.naturalAbilityCompletionUnitIdsThisTick,
                            ]),
                        ],
                    };
                } else {
                    engine.deferredOrderPause = {
                        waiters,
                        naturalCompletionUnitIds: [...engine.naturalAbilityCompletionUnitIdsThisTick],
                    };
                }
                engine.naturalAbilityCompletionUnitIdsThisTick.clear();
            } else if (
                waiters.length > 0
                && engine.isSequentialTargetingPreview
                && !this.waitersIncludeConditionalCancelPause(waiters)
            ) {
                // Host/solo (and non-host ally-only): parallel pause would have formed but ITS
                // playahead skips scheduling it — same observability hook as drop in commitDeferred.
                engine.onItsParallelPauseDecision?.('drop', waiters, engine.gameTick);
                this.droppedItsPreviewPause = {
                    gameTick: engine.gameTick,
                    waiters,
                    naturalCompletionUnitIds: [...engine.naturalAbilityCompletionUnitIdsThisTick],
                };
            }
        }
    }
}
