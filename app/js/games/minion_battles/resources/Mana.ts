/**
 * Mana - Caster resource.
 *
 * Starts at 50, max 100. Gains +15 when the attached unit's turn ends.
 */

import { Resource } from './Resource';
import type { EventBus, TurnEndEvent } from '../engine/EventBus';
import type { Unit } from '../objects/Unit';

export class Mana extends Resource {
    readonly id = 'mana';
    readonly name = 'Mana';
    readonly color = '#3b82f6'; // blue-500

    private boundOnTurnEnd: ((data: TurnEndEvent) => void) | null = null;

    constructor() {
        super(50, 100);
    }

    protected subscribe(unit: Unit, eventBus: EventBus): void {
        this.boundOnTurnEnd = (data: TurnEndEvent) => {
            if (data.unitId === this.unitId) {
                this.add(15);
            }
        };
        eventBus.on('turn_end', this.boundOnTurnEnd);
    }

    protected unsubscribe(eventBus: EventBus): void {
        if (this.boundOnTurnEnd) {
            eventBus.off('turn_end', this.boundOnTurnEnd);
            this.boundOnTurnEnd = null;
        }
    }
}
