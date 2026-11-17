/**
 * Reflex — the resource a player spends to answer a Reactable enemy attack at its reaction frame.
 * Starts at {@link REFLEX_START}, holds at most {@link REFLEX_MAX}, and recovers {@link REFLEX_PER_ROUND}
 * at the start of every round. Passing at a reaction frame is free; acting costs 1.
 *
 * Only units whose owner knows Reactions carry it; see {@link attachReflexIfKnown}.
 */

import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { ResourceId } from './resourceIds';

/** Reflex a unit starts the battle with. */
export const REFLEX_START = 1;
/** Most Reflex a unit can hold. */
export const REFLEX_MAX = 1;
/** Recovered at the start of each round, clamped to {@link REFLEX_MAX}. */
export const REFLEX_PER_ROUND = 1;

/** Violet-300: reads against the Nightbloom palette and apart from the other resource colours. */
export const REFLEX_RESOURCE_COLOR = '#c4b5fd';

export class Reflex extends Resource {
    readonly id = ResourceId.Reflex;
    readonly name = 'Reflex';
    readonly color = REFLEX_RESOURCE_COLOR;
    readonly iconName = 'Zap';
    readonly barStyle = 'pips';

    constructor() {
        super(REFLEX_START, REFLEX_MAX);
    }

    get perRoundGain(): number {
        return REFLEX_PER_ROUND;
    }

    onRoundStart(_unit: Unit, _engine: EngineContext): void {
        this.add(REFLEX_PER_ROUND);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // Recovery is onRoundStart only.
    }

    protected unsubscribe(_eventBus: EventBus): void {
        // No listeners to remove.
    }
}

// One source of truth: the per-player flag in serialized engine state (Step 11). Re-exported for existing callers.
export { playerKnowsReactions } from '../game/reactions/playerKnowledge';

/**
 * Gives `unit` a Reflex resource when `knowsReactions` is true and it does not already have one.
 * Returns the attached resource, or null when nothing was attached.
 */
export function attachReflexIfKnown(unit: Unit, eventBus: EventBus, knowsReactions: boolean): Reflex | null {
    if (!knowsReactions || unit.getResource(ResourceId.Reflex)) return null;
    const reflex = new Reflex();
    unit.attachResource(reflex, eventBus);
    return reflex;
}
