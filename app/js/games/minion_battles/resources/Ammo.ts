import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';

export const AMMO_DEFAULT_MAX = 100;

export class Ammo extends Resource {
    readonly id = 'ammo';
    readonly name = 'Ammo';
    readonly color = '#eab308';
    readonly iconName = 'Crosshair';

    constructor() {
        super(AMMO_DEFAULT_MAX, AMMO_DEFAULT_MAX);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // Ammo has no passive event-driven behavior yet.
    }

    protected unsubscribe(_eventBus: EventBus): void {
        // No listeners to remove.
    }
}
