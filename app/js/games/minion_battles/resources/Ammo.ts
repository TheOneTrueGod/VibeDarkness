import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';

export class Ammo extends Resource {
    readonly id = 'ammo';
    readonly name = 'Ammo';
    readonly color = '#eab308';

    constructor() {
        super(100, 100);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // Ammo has no passive event-driven behavior yet.
    }

    protected unsubscribe(_eventBus: EventBus): void {
        // No listeners to remove.
    }
}
