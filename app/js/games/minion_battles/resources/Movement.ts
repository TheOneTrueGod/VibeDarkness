/**
 * Movement - Universal resource for movement-based abilities.
 *
 * Starts at 2, max 3. Recovery is handled in Unit.onRoundStart (not via EventBus)
 * because it requires terrain context to count slow stacks.
 */

import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';

export class Movement extends Resource {
    readonly id = 'movement_points';
    readonly name = 'Movement Points';
    readonly color = '#22c55e'; // green-500
    readonly iconName = 'Footprints';

    constructor() {
        super(2, 2);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {}

    protected unsubscribe(_eventBus: EventBus): void {}
}
