/**
 * OrderManager — owns pending orders and waiting-for-orders state.
 * Handles order scheduling, application, and parallel-batch readiness checks.
 */

import type { EngineContext } from '../EngineContext';
import type { BattleOrder, OrderAtTick, WaitingForOrders, OrderWaiter } from '../types';
import type { Unit } from '../units/Unit';
import { getAbility } from '../../abilities/AbilityRegistry';
import { refundAbilityCost } from '../../abilities/Ability';
import { unitAbilityHasTag } from '../../abilities/abilityUses';

const WAIT_ORDER_MIN_DURATION_SEC = 1.5;
const WAIT_ORDER_MAX_DURATION_SEC = 1.5;

export class OrderManager {
    pendingOrders: OrderAtTick[] = [];
    waitingForOrders: WaitingForOrders | null = null;

    private ctx: EngineContext;
    private onAfterOrderQueued: () => void;

    /**
     * @param onAfterOrderQueued Called by applyOrder after queuing, if a parallel pause is active.
     *   Wired to GameEngine.tryResumeParallel by the engine.
     */
    constructor(ctx: EngineContext, onAfterOrderQueued: () => void) {
        this.ctx = ctx;
        this.onAfterOrderQueued = onAfterOrderQueued;
    }

    /**
     * Returns true if `unitId` has a queued order scheduled at or after `earliestTickInclusive`.
     * Omit the second arg to detect any order at the current simulation tick onward.
     */
    hasPendingOrderForUnit(unitId: string, earliestTickInclusive = this.ctx.gameTick): boolean {
        return this.pendingOrders.some((o) => o.gameTick >= earliestTickInclusive && o.order.unitId === unitId);
    }

    /**
     * Whether this engine should pause for orders for the given unit.
     * Returns false when an order is already pending (engine will apply it naturally).
     */
    shouldPauseForOrders(unit: Unit): boolean {
        if (!unit.isPlayerControlled() || !unit.canAct() || !unit.isAlive()) return false;
        if (unit.movement !== null && unit.movement.path.length > 0 && !unit.movementPaused) return false;
        return !this.hasPendingOrderForUnit(unit.id);
    }

    /** All player units that owe orders in the current parallel slice (deterministic order). */
    collectParallelWaiters(): OrderWaiter[] {
        const out: OrderWaiter[] = [];
        for (const unit of this.ctx.units) {
            if (!unit.active) continue;
            if (this.shouldPauseForOrders(unit)) {
                out.push({ unitId: unit.id, ownerId: unit.ownerId });
            }
        }
        out.sort((a, b) =>
            a.ownerId !== b.ownerId ? a.ownerId.localeCompare(b.ownerId) : a.unitId.localeCompare(b.unitId),
        );
        return out;
    }

    /** Next local player's unit in this batch that still needs an order at the batch tick (UI / previews). */
    getActiveOrderWaiterForPlayer(playerId: string): OrderWaiter | null {
        const w = this.waitingForOrders;
        if (!w) return null;
        for (const waiter of w.waiters) {
            if (waiter.ownerId !== playerId) continue;
            if (!this.hasPendingOrderForUnit(waiter.unitId, w.atTick)) {
                return waiter;
            }
        }
        return null;
    }

    applyOrder(order: BattleOrder): void {
        let atTick = this.ctx.gameTick;
        if (this.waitingForOrders) {
            const batch = this.waitingForOrders;
            const allowed = batch.waiters.some((x) => x.unitId === order.unitId);
            if (!allowed) {
                // TODO [rollback]: Support transactional batch apply—snapshot pre-batch, validate all orders, rollback state if any reject; or buffer commits until atomic apply.
                return;
            }
            if (this.hasPendingOrderForUnit(order.unitId, batch.atTick)) {
                // TODO [rollback]: Support transactional batch apply—snapshot pre-batch, validate all orders, rollback state if any reject; or buffer commits until atomic apply.
                return;
            }
            atTick = batch.atTick;
        }
        const orderingUnit = this.ctx.getUnit(order.unitId);
        if (orderingUnit && !this.resolveConditionalCancelIfNeeded(orderingUnit, order)) {
            return;
        }

        this.queueOrder(atTick, order);

        if (this.waitingForOrders) {
            this.onAfterOrderQueued();
        }
    }

    /**
     * Resolves a mid-ability conditional cancel choice while the parallel pause batch is still active.
     * Returns false when the order should be rejected (invalid ability tag).
     */
    private applyConditionalCancelDecision(
        order: BattleOrder,
        unit: Unit,
        pausedAbility: NonNullable<Unit['activeAbilities'][number]>,
    ): boolean {
        if (!unit.isAlive()) return false;

        if (order.abilityId === 'wait') {
            pausedAbility.conditionalCancelPaused = false;
            pausedAbility.conditionalCancelTagFilter = undefined;
            return true;
        }

        const tagFilter = pausedAbility.conditionalCancelTagFilter;
        if (tagFilter && tagFilter.length > 0) {
            for (const tag of tagFilter) {
                if (!unitAbilityHasTag(unit, order.abilityId, tag)) return false;
            }
        }

        const cancelledAbilityId = pausedAbility.abilityId;
        const cancelledAbility = getAbility(cancelledAbilityId);
        if (cancelledAbility) {
            refundAbilityCost(unit, cancelledAbility);
        }
        this.ctx.cancelActiveAbility(unit.id, cancelledAbilityId);
        unit.clearAbilityNote();
        return true;
    }

    queueOrder(atTick: number, order: BattleOrder): void {
        const effectiveTick = atTick < this.ctx.gameTick ? this.ctx.gameTick : atTick;
        this.pendingOrders = this.pendingOrders.filter(
            (o) => !(o.gameTick === effectiveTick && o.order.unitId === order.unitId),
        );
        const entry: OrderAtTick = { gameTick: effectiveTick, order };
        this.pendingOrders.push(entry);
        this.pendingOrders.sort((a, b) => {
            if (a.gameTick !== b.gameTick) return a.gameTick - b.gameTick;
            const ua = a.order.unitId;
            const ub = b.order.unitId;
            if (ua !== ub) return ua < ub ? -1 : ua > ub ? 1 : 0;
            const aa = a.order.abilityId;
            const ab = b.order.abilityId;
            return aa < ab ? -1 : aa > ab ? 1 : 0;
        });

        if (effectiveTick === this.ctx.gameTick) {
            this.applyOrderLogic(order);
        }
    }

    /**
     * When a unit is mid conditional-cancel pause, resolve the player's choice before the order runs.
     * Returns false when the order is rejected (e.g. ineligible ability tag).
     */
    private resolveConditionalCancelIfNeeded(unit: Unit, order: BattleOrder): boolean {
        const pausedAbility = unit.activeAbilities.find((a) => a.conditionalCancelPaused);
        if (!pausedAbility) return true;
        return this.applyConditionalCancelDecision(order, unit, pausedAbility);
    }

    applyOrderLogic(order: BattleOrder): void {
        const unit = this.ctx.getUnit(order.unitId);
        if (!unit || !unit.isAlive()) return;
        if (!this.resolveConditionalCancelIfNeeded(unit, order)) return;
        this.ctx.mixOrderFingerprint(order.unitId, order.abilityId);

        unit.waitMinEndTime = null;
        unit.waitMaxEndTime = null;
        unit.movementPaused = false;

        if (order.movePath !== undefined && order.movePath !== null && order.movePath.length > 0) {
            unit.setMovement(order.movePath, undefined, this.ctx.gameTick);
        } else if (order.movePath === null) {
            unit.clearMovement();
        }

        if (order.abilityId === 'wait') {
            // Mid-cast resume (conditional cancel): keep the active cast, skip turn wait lockout.
            if (unit.activeAbilities.length > 0) {
                return;
            }
            unit.waitMinEndTime = this.ctx.gameTime + WAIT_ORDER_MIN_DURATION_SEC;
            unit.waitMaxEndTime = this.ctx.gameTime + WAIT_ORDER_MAX_DURATION_SEC;
            return;
        }

        const ability = getAbility(order.abilityId);
        if (!ability) return;

        unit.executeAbility(ability, order.targets, this.ctx);

        // Populate targetsByLabel (non-serialized, new-style targeting) from the order payload.
        // Re-map each value to the corresponding entry in active.targets (which are shallow
        // copies of order.targets), so that indexOf() in MeleeAttackBehaviour.onSetup returns
        // the correct index via reference equality rather than -1.
        if (order.targetsByLabel) {
            const active = unit.activeAbilities.find((a) => a.abilityId === ability.id);
            if (active) {
                const remapped: Record<string, import('../types').ResolvedTarget> = {};
                for (const [label, orderTarget] of Object.entries(order.targetsByLabel)) {
                    const idx = order.targets.indexOf(orderTarget);
                    remapped[label] = (idx >= 0 && active.targets[idx] !== undefined)
                        ? active.targets[idx]!
                        : orderTarget;
                }
                active.targetsByLabel = remapped;
            }
        }
    }
}
