/**
 * Static — Storm Core resource. A slow trickle on its own; bursts come from Thunderclap.
 *
 * - Recovers {@link STATIC_RECOVERY_PER_INTERVAL} every {@link STATIC_RECOVERY_SECONDS} (half a round).
 *   World modifiers speed that up through `resourceGainMultipliers` (Rainy Storm doubles it).
 * - Moving and standing still change nothing. Thunderclap is the burst source: 1 Static per Conductive
 *   stack it draws out.
 *
 * The recovery timer is serialized with the resource.
 */

import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { ResourceId } from './resourceIds';
import { getThemeById } from '../themes/abilityTheme';
import { ROUND_DURATION } from '../game/gameConstants';

/** Pips of Static the unit can hold. */
export const STATIC_MAX = 6;
/** Granted at mission start by the Storm Core research node. */
export const STATIC_MISSION_START = 2;

/** Seconds between passive recoveries: half a round. */
export const STATIC_RECOVERY_SECONDS = ROUND_DURATION / 2;
/** Static recovered each {@link STATIC_RECOVERY_SECONDS}. */
export const STATIC_RECOVERY_PER_INTERVAL = 1;

/** Static is the storm's "event" colour: the theme secondary (electric cyan). */
export const STATIC_RESOURCE_COLOR = getThemeById('storm').secondary;
/** Yellow crackle animated over each filled Static orb. */
export const STATIC_PIP_CRACKLE_COLOR = '#facc15';

/** The slice of the engine Static reads. Optional so light test hosts can omit world modifiers. */
type StaticEngine = Pick<EngineContext, 'roundNumber'> & Partial<Pick<EngineContext, 'worldModifierManager'>>;

export class Static extends Resource {
    readonly id = ResourceId.Static;
    readonly name = 'Static';
    readonly color = STATIC_RESOURCE_COLOR;
    readonly iconName = 'CloudLightning';
    readonly barStyle = 'pips';
    readonly pipCrackleColor = STATIC_PIP_CRACKLE_COLOR;

    /** Seconds toward the next passive recovery. */
    recoverySeconds = 0;

    constructor() {
        super(0, STATIC_MAX);
    }

    onTick(unit: Unit, engine: EngineContext, dt: number): void {
        this.track(unit, engine, dt);
    }

    /** Engine-light entry point so tests can drive the timer without a full engine. */
    track(unit: Pick<Unit, 'isAlive'>, engine: StaticEngine, dt: number): void {
        if (!unit.isAlive()) return;
        const mult = engine.worldModifierManager?.getResourceGainMultiplier(this.id, engine.roundNumber) ?? 1;
        this.recoverySeconds += dt * mult;
        while (this.recoverySeconds >= STATIC_RECOVERY_SECONDS) {
            this.recoverySeconds -= STATIC_RECOVERY_SECONDS;
            this.add(STATIC_RECOVERY_PER_INTERVAL);
        }
    }

    /** Tooltip: the passive recovery rate. */
    get perSecondGain(): number {
        return STATIC_RECOVERY_PER_INTERVAL / STATIC_RECOVERY_SECONDS;
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // The timer runs in onTick.
    }

    protected unsubscribe(_eventBus: EventBus): void {
        // Nothing subscribed.
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            recoverySeconds: this.recoverySeconds,
        };
    }

    override restoreFromJSON(data: Record<string, unknown>): void {
        super.restoreFromJSON(data);
        this.recoverySeconds = typeof data.recoverySeconds === 'number' ? data.recoverySeconds : 0;
    }
}
