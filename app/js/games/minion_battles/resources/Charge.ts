/**
 * Charge — a short pool the Armory spends to conjure weapons and place sentries.
 * Mission start grants {@link CHARGE_MISSION_START}. Later rounds add {@link CHARGE_PER_ROUND},
 * capped at {@link CHARGE_MAX}. Round 1 does not recover, so the grant is not doubled.
 */

import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { ResourceId } from './resourceIds';
import { getThemeById } from '../themes/abilityTheme';

/** Charge stored on the unit. */
export const CHARGE_MAX = 6;
/** Granted once at mission start. Round 1 does not also recover, so the opener is this amount. */
export const CHARGE_MISSION_START = 3;
/** Added at the start of round 2 and each round after. */
export const CHARGE_PER_ROUND = 3;

/** Charge is the Armory's "event" colour: the theme secondary (bone). */
export const CHARGE_RESOURCE_COLOR = getThemeById('armory').secondary;

export class Charge extends Resource {
    readonly id = ResourceId.Charge;
    readonly name = 'Charge';
    readonly color = CHARGE_RESOURCE_COLOR;
    readonly iconName = 'Swords';

    constructor() {
        super(0, CHARGE_MAX);
    }

    get perRoundGain(): number {
        return CHARGE_PER_ROUND;
    }

    onRoundStart(_unit: Unit, engine: EngineContext): void {
        if (engine.roundNumber <= 1) return;
        this.add(CHARGE_PER_ROUND);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // Recovery is onRoundStart only.
    }

    protected unsubscribe(_eventBus: EventBus): void {
        // No listeners to remove.
    }
}
