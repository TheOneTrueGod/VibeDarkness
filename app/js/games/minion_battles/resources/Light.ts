/**
 * Light — the unit devours and stores ambient light, using it to power abilities.
 * Light is consumed when illumination-based skills are activated.
 * More light = stronger and more frequent abilities; darkness = silence.
 *
 * Recovery: at round start, gain light based on the tile the unit occupies.
 * Formula: max(0, ceil((tileLightLevel - LIGHT_RESOURCE_MIN_LIGHT_LEVEL) / LIGHT_RESOURCE_DIVISOR))
 * Both constants are exported so future research nodes can modify them.
 */

import { Resource } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';

/** Minimum tile light level required to gain any Light resource per round. */
export const LIGHT_RESOURCE_MIN_LIGHT_LEVEL = 4;
/** Divisor in the per-round recovery formula; lower = faster recovery. */
export const LIGHT_RESOURCE_DIVISOR = 3;

export class Light extends Resource {
    readonly id = 'light';
    readonly name = 'Light';
    readonly color = '#fef9c3'; // warm white-yellow
    readonly iconName = 'Sun';

    private _unit: Unit | null = null;
    private _engine: EngineContext | null = null;

    constructor() {
        super(0, 5);
    }

    /** Live per-round gain for the unit's current tile. Used by the tooltip. */
    get perRoundGain(): number {
        if (!this._unit || !this._engine) return 0;
        const level = this._engine.getLightLevelAt(this._unit.x, this._unit.y);
        if (level === null) return 0;
        return Math.max(
            0,
            Math.ceil((level - LIGHT_RESOURCE_MIN_LIGHT_LEVEL) / LIGHT_RESOURCE_DIVISOR),
        );
    }

    onRoundStart(unit: Unit, engine: EngineContext): void {
        this._unit = unit;
        this._engine = engine;
        this.add(this.perRoundGain);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // Recovery is handled via onRoundStart (needs engine context for tile light level).
    }

    protected unsubscribe(_eventBus: EventBus): void {
        this._unit = null;
        this._engine = null;
    }
}
