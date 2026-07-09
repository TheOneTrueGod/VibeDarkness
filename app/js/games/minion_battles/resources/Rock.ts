/**
 * Rock — the unit breaks down large rocks, compacting and storing
 * them as dense pebbles. These are hurled as offensive tools.
 *
 * Pebble stockpile refills when near stone terrain or upon destroying rocks.
 * Each pebble represents a small reserve of compressed kinetic energy.
 */

import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';

export class Rock extends Resource {
    readonly id = 'rock';
    readonly name = 'Rock';
    readonly color = '#92400e'; // earthy brown
    readonly iconName = 'Mountain';

    constructor() {
        super(0, 24);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // Gain mechanics TBD (e.g. nearby_stone_damaged, terrain proximity).
    }

    protected unsubscribe(_eventBus: EventBus): void {
        // No listeners to remove.
    }
}
