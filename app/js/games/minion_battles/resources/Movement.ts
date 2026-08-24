/**
 * Movement - Universal resource for movement-based abilities.
 *
 * Starts at {@link MOVEMENT_BASE_MAX}. Recovery is handled in Unit.onRoundStart (not via EventBus)
 * because it requires terrain context to count slow stacks.
 */

import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';

/** Starting and default max movement points (before research passives). */
export const MOVEMENT_BASE_MAX = 2;
/** Default round-start recovery before slow stacks and research passives. */
export const MOVEMENT_BASE_RECOVERY_PER_ROUND = MOVEMENT_BASE_MAX;

export class Movement extends Resource {
    readonly id = 'movement_points';
    readonly name = 'Movement Points';
    readonly color = '#22c55e'; // green-500
    readonly iconName = 'Footprints';

    constructor() {
        super(MOVEMENT_BASE_MAX, MOVEMENT_BASE_MAX);
    }

    attach(unit: Unit, eventBus: EventBus): void {
        super.attach(unit, eventBus);
        const newMax = unit.getMaxMovement();
        const extra = Math.max(0, newMax - this.max);
        this.max = newMax;
        if (extra > 0) this.add(extra);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {}

    protected unsubscribe(_eventBus: EventBus): void {}
}
