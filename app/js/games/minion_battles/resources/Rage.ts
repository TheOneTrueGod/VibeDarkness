/**
 * Rage - Warrior resource.
 *
 * Starts at 0, max 100. Gains +10 whenever the attached unit takes damage.
 */

import { Resource } from './Resource';
import type { EventBus, DamageTakenEvent } from '../engine/EventBus';
import type { Unit } from '../objects/Unit';

export class Rage extends Resource {
    readonly id = 'rage';
    readonly name = 'Rage';
    readonly color = '#ef4444'; // red-500

    private boundOnDamageTaken: ((data: DamageTakenEvent) => void) | null = null;

    constructor() {
        super(0, 100);
    }

    protected subscribe(unit: Unit, eventBus: EventBus): void {
        this.boundOnDamageTaken = (data: DamageTakenEvent) => {
            if (data.unitId === this.unitId) {
                this.add(10);
            }
        };
        eventBus.on('damage_taken', this.boundOnDamageTaken);
    }

    protected unsubscribe(eventBus: EventBus): void {
        if (this.boundOnDamageTaken) {
            eventBus.off('damage_taken', this.boundOnDamageTaken);
            this.boundOnDamageTaken = null;
        }
    }
}
