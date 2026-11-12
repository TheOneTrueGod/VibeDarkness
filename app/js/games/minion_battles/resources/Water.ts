/**
 * Water — Water tree resource, drawn from nearby water tiles.
 *
 * While below max and standing in or beside water, the unit siphons up to 4 water tiles in the 3x3
 * around it ({@link WATER_SIPHON}, the generic `terrainSiphon`): each drawn tile loses 1/8 of a level
 * per second and the unit gains 0.5 Water per second. A tile that runs out drops a level
 * (deep -> water -> shallow -> dirt).
 */

import { Resource, type ResourceBarStyle } from './Resource';
import type { EventBus } from '../game/EventBus';
import type { Unit } from '../game/units/Unit';
import type { EngineContext } from '../game/EngineContext';
import { ResourceId } from './resourceIds';
import { getThemeById } from '../themes/abilityTheme';
import { WATER_TERRAIN_TYPES } from '../terrain/TerrainType';
import { tickTerrainSiphon, terrainSiphonGainPerSec, type TerrainSiphonConfig } from './terrainSiphon';

/** Most Water the unit can hold. */
export const WATER_MAX = 16;

/** Water is the tree's "event" colour: the theme secondary (seafoam). */
export const WATER_RESOURCE_COLOR = getThemeById('water').secondary;

/** The deep end of the liquid bar's gradient: the theme primary (deep navy). */
export const WATER_BAR_DEEP_COLOR = getThemeById('water').primary;

/** How Water is drawn from the ground: up to 4 water tiles in the 3x3, 1/8 level/s each, +0.5 Water/s. */
export const WATER_SIPHON: TerrainSiphonConfig = {
    terrains: WATER_TERRAIN_TYPES,
    radiusCells: 1,
    maxTiles: 4,
    drainPerTilePerSec: 1 / 8,
    gainPerSec: 0.5,
};

/** Water bar style: the moving liquid surface (rendered by `LiquidResourceBar`). */
export const WATER_BAR_STYLE: ResourceBarStyle = 'liquid';

/** Tooltip lines under the name, as in the studio mock (`Ideas/fxArt/waterArt.tsx`). */
export const WATER_TOOLTIP_LINES: readonly string[] = [
    `+${WATER_SIPHON.gainPerSec}/s in or beside water`,
    `Drains up to ${WATER_SIPHON.maxTiles} nearby tiles · max ${WATER_MAX}`,
];

export class Water extends Resource {
    readonly id = ResourceId.Water;
    readonly name = 'Water';
    readonly color = WATER_RESOURCE_COLOR;
    readonly iconName = 'Droplet';
    readonly barStyle = WATER_BAR_STYLE;
    readonly barDeepColor = WATER_BAR_DEEP_COLOR;
    readonly tooltipLines = WATER_TOOLTIP_LINES;

    private _unit: Unit | null = null;
    private _engine: EngineContext | null = null;

    constructor() {
        super(0, WATER_MAX);
    }

    /** Live per-second gain from the unit's surroundings. Used by the tooltip. */
    get perSecondGain(): number {
        if (!this._unit || !this._engine) return 0;
        return terrainSiphonGainPerSec(this, this._unit, this._engine.terrainManager, WATER_SIPHON);
    }

    primeDisplayContext(unit: Unit, engine: EngineContext): void {
        this._unit = unit;
        this._engine = engine;
    }

    onTick(unit: Unit, engine: EngineContext, dt: number): void {
        this.primeDisplayContext(unit, engine);
        tickTerrainSiphon(this, unit, engine, dt, WATER_SIPHON);
    }

    protected subscribe(_unit: Unit, _eventBus: EventBus): void {
        // Gain is handled in onTick (needs the terrain around the unit).
    }

    protected unsubscribe(_eventBus: EventBus): void {
        this._unit = null;
        this._engine = null;
    }
}
