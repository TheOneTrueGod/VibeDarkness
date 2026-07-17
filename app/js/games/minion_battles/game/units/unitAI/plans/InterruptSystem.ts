/**
 * InterruptSystem - Subscribes to engine events and marks pendingInterrupts on
 * affected units so the tactical plan layer can react on the next AI tick.
 *
 * Usage:
 *   const sys = new InterruptSystem(() => engine.units);
 *   sys.registerListeners(engine.eventBus);
 *   // After each AI phase: sys.clearAllInterrupts();
 */

import type { Unit } from '../../Unit';
import type { EventBus } from '../../../EventBus';

/** Chebyshev radius (in grid tiles) within which a terrain change invalidates a path waypoint. */
export const TERRAIN_INTERRUPT_RADIUS = 2;

/** Fraction of maxHp that counts as significant damage in a single hit. */
const SIGNIFICANT_DAMAGE_THRESHOLD_FRACTION = 0.20;

export class InterruptSystem {
    private getUnits: () => Unit[];

    constructor(getUnits: () => Unit[]) {
        this.getUnits = getUnits;
    }

    /**
     * Subscribe to engine events. Call once during engine init, after eventBus.clear() resets
     * any previous listeners.
     */
    registerListeners(eventBus: EventBus): void {
        eventBus.on('unit_died', (data) => {
            const deadUnitId = data.unitId;
            for (const unit of this.getUnits()) {
                if (!unit.isAlive()) continue;
                const planTargetId = unit.tacticalPlan?.data.targetUnitId;
                const ctxTargetId = unit.aiContext?.targetUnitId;
                if (planTargetId === deadUnitId || ctxTargetId === deadUnitId) {
                    unit.pendingInterrupts.add('target_died');
                }
            }
        });

        eventBus.on('terrain_stone_damaged', (event) => {
            const changedCol = event.col;
            const changedRow = event.row;
            for (const unit of this.getUnits()) {
                if (!unit.isAlive()) continue;
                const waypoints = unit.tacticalPlan?.pathWaypoints;
                if (!waypoints || waypoints.length === 0) continue;
                const nearPath = waypoints.some((wp) => {
                    return (
                        Math.abs(wp.col - changedCol) <= TERRAIN_INTERRUPT_RADIUS &&
                        Math.abs(wp.row - changedRow) <= TERRAIN_INTERRUPT_RADIUS
                    );
                });
                if (nearPath) {
                    unit.pendingInterrupts.add('terrain_changed_near_path');
                }
            }
        });

        eventBus.on('damage_taken', (data) => {
            const unit = this.findUnit(data.unitId);
            if (!unit || !unit.isAlive()) return;
            const threshold = SIGNIFICANT_DAMAGE_THRESHOLD_FRACTION * unit.maxHp;
            if (data.amount >= threshold) {
                unit.pendingInterrupts.add('took_significant_damage');
            }
        });
    }

    /** Clear all pending interrupts on every unit. Call after the AI phase each tick. */
    clearAllInterrupts(): void {
        for (const unit of this.getUnits()) {
            unit.pendingInterrupts.clear();
        }
    }

    private findUnit(id: string): Unit | undefined {
        return this.getUnits().find((u) => u.id === id);
    }
}
