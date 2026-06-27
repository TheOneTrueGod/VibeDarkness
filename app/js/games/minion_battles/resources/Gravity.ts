/**
 * Gravity — the unit bends local gravitational fields, storing tidal energy.
 * This energy warps projectile paths, slams enemies downward,
 * or launches allies and foes into the air.
 *
 * Gravity builds passively from movement, from impacts, or from proximity
 * to large masses (heavy enemies, dense terrain). High Gravity enables
 * field-warping abilities that alter the entire battlefield.
 */

import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';

export class Gravity extends Resource {
    readonly id = 'gravity';
    readonly name = 'Gravity';
    readonly color = '#a855f7'; // purple-500
    readonly iconName = 'Atom';

    constructor() {
        super(0, 100);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // Gain mechanics TBD (e.g. mass proximity, impact events).
    }

    protected unsubscribe(_eventBus: EventBus): void {
        // No listeners to remove.
    }
}
