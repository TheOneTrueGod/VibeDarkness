/**
 * Static — Storm Core resource. Built by moving, lost by standing still.
 *
 * Every {@link STATIC_PX_PER_POINT} px the unit travels (walking, dashing, being knocked back, hasted)
 * builds one Static, up to {@link STATIC_MAX}. Standing still for {@link STATIC_GROUND_SECONDS} grounds
 * one Static out (and another every interval after). World modifiers can speed the build-up through
 * `resourceGainMultipliers` (Rainy Storm doubles it).
 *
 * Travel is measured from the unit's own position each tick, so it is deterministic and needs no
 * movement hooks. Partial progress and the stillness timer are serialized with the resource.
 */

import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { ResourceId } from './resourceIds';
import { getThemeById } from '../themes/abilityTheme';

/** Pips of Static the unit can hold. */
export const STATIC_MAX = 6;
/** Granted at mission start by the Storm Core research node. */
export const STATIC_MISSION_START = 2;
/** Distance (px) the unit must travel to build one Static. Three cells. */
export const STATIC_PX_PER_POINT = 120;
/**
 * A single tick moving further than this (px) is a teleport or a snap, not travel, and builds nothing.
 * Well above any dash speed (Static Step covers ~10 px per tick).
 */
export const STATIC_MAX_STEP_PX = 48;
/** Below this per-tick displacement (px) the unit counts as standing still. */
export const STATIC_STILL_EPSILON_PX = 0.05;
/** Seconds of standing still before one Static grounds out (then again every this many seconds). */
export const STATIC_GROUND_SECONDS = 2.5;

/** Static is the storm's "event" colour: the theme secondary (electric cyan). */
export const STATIC_RESOURCE_COLOR = getThemeById('storm').secondary;

/** The slice of the engine Static reads. Optional so light test hosts can omit world modifiers. */
type StaticEngine = Pick<EngineContext, 'roundNumber'> & Partial<Pick<EngineContext, 'worldModifierManager'>>;

export class Static extends Resource {
    readonly id = ResourceId.Static;
    readonly name = 'Static';
    readonly color = STATIC_RESOURCE_COLOR;
    readonly iconName = 'CloudLightning';
    readonly barStyle = 'pips';

    /** Px travelled toward the next Static. */
    progressPx = 0;
    /** Seconds the unit has stood still since it last moved (or last grounded out). */
    stillSeconds = 0;
    /** Position at the end of the last tick; null until the first tick after attach / restore. */
    private lastX: number | null = null;
    private lastY: number | null = null;

    constructor() {
        super(0, STATIC_MAX);
    }

    onTick(unit: Unit, engine: EngineContext, dt: number): void {
        this.trackTravel(unit, engine, dt);
    }

    /** Engine-light entry point so tests can drive travel without a full engine. */
    trackTravel(unit: Pick<Unit, 'x' | 'y' | 'isAlive'>, engine: StaticEngine, dt: number): void {
        const { x, y } = unit;
        if (this.lastX === null || this.lastY === null) {
            this.lastX = x;
            this.lastY = y;
            return;
        }
        const moved = Math.hypot(x - this.lastX, y - this.lastY);
        this.lastX = x;
        this.lastY = y;
        if (!unit.isAlive()) return;

        if (moved <= STATIC_STILL_EPSILON_PX) {
            this.stillSeconds += dt;
            if (this.stillSeconds >= STATIC_GROUND_SECONDS) {
                this.stillSeconds -= STATIC_GROUND_SECONDS;
                this.progressPx = 0;
                if (this.current > 0) this.current -= 1;
            }
            return;
        }

        this.stillSeconds = 0;
        if (moved > STATIC_MAX_STEP_PX) return;
        const mult = engine.worldModifierManager?.getResourceGainMultiplier(this.id, engine.roundNumber) ?? 1;
        this.progressPx += moved * mult;
        while (this.progressPx >= STATIC_PX_PER_POINT) {
            this.progressPx -= STATIC_PX_PER_POINT;
            this.add(1);
        }
        // A full pool does not bank progress toward a pip it cannot hold.
        if (this.current >= this.max) this.progressPx = 0;
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // Travel is measured in onTick.
    }

    protected unsubscribe(_eventBus: EventBus): void {
        this.lastX = null;
        this.lastY = null;
    }

    override toJSON(): Record<string, unknown> {
        return {
            ...super.toJSON(),
            progressPx: this.progressPx,
            stillSeconds: this.stillSeconds,
            lastX: this.lastX,
            lastY: this.lastY,
        };
    }

    override restoreFromJSON(data: Record<string, unknown>): void {
        super.restoreFromJSON(data);
        this.progressPx = typeof data.progressPx === 'number' ? data.progressPx : 0;
        this.stillSeconds = typeof data.stillSeconds === 'number' ? data.stillSeconds : 0;
        this.lastX = typeof data.lastX === 'number' ? data.lastX : null;
        this.lastY = typeof data.lastY === 'number' ? data.lastY : null;
    }
}
