/**
 * SuperBar — enemy "super meter". Whole bars are spent by super abilities (e.g. Displacer's
 * Phantom Decoy) and gained by setup abilities (e.g. Light Eater). Purely ability-driven:
 * it has no passive gain, so units that use it get their starting bars from their unit def
 * (`startingResources`).
 */

import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';

export const SUPER_BAR_MAX = 3;

export class SuperBar extends Resource {
    readonly id = 'super';
    readonly name = 'Super';
    readonly color = '#38bdf8'; // sky-400
    readonly iconName = 'Zap';

    constructor() {
        super(0, SUPER_BAR_MAX);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // No listeners: bars are granted/spent only by abilities.
    }

    protected unsubscribe(_eventBus: EventBus): void {
        // No listeners to remove.
    }
}
