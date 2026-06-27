/**
 * Light — the unit devours and stores ambient light, using it to power abilities.
 * Light is consumed when illumination-based skills are activated.
 * More light = stronger and more frequent abilities; darkness = silence.
 *
 * Gain mechanics are character-specific (e.g. absorbing nearby torches,
 * standing in sunlight, or passively siphoning from enemies' vision cones).
 */

import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';

export class Light extends Resource {
    readonly id = 'light';
    readonly name = 'Light';
    readonly color = '#fef9c3'; // warm white-yellow
    readonly iconName = 'Sun';

    constructor() {
        super(0, 100);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // Gain mechanics TBD per character type.
    }

    protected unsubscribe(_eventBus: EventBus): void {
        // No listeners to remove.
    }
}
