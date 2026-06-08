import { EARTH_CORE_SHARED_DIAMETER } from '../card_defs/05_earth_core/earthCoreConstants';
import type { TerrainManager } from '../terrain/TerrainManager';
import type { Unit } from '../game/units/Unit';
import { isOnStone } from './earthCoreHelpers';
import { getEffectiveTerrain } from '../terrain/FloorTile';

export const IMPACT_CONVERSION_PASSIVE_ID = '0521';
export const BEDROCK_SCAVENGER_PASSIVE_ID = '0522';
export const DEEP_RESONANCE_PASSIVE_ID = '0523';
export const EARTHERN_PUNCH_ABILITY_ID = '0524';
export const SHAKING_GROUND_ABILITY_ID = '0525';
export const SHATTER_ABILITY_ID = '0526';

const BEDROCK_SCAVENGER_ARMOUR_MAX_PER_ROUND = 3;
const DEEP_RESONANCE_TREMORSENSE_RANGE_MODIFIER = 1;

export function unitHasEarthCorePassive(unit: Unit, abilityId: string): boolean {
    return unit.abilities.includes(abilityId);
}

export function getTremorsenseRangeModifier(unit: Unit): number {
    if (!unitHasEarthCorePassive(unit, DEEP_RESONANCE_PASSIVE_ID)) return 0;
    return DEEP_RESONANCE_TREMORSENSE_RANGE_MODIFIER;
}

export function getTremorsenseRadiusTilesForUnit(unit: Unit): number {
    return (EARTH_CORE_SHARED_DIAMETER / 2) + getTremorsenseRangeModifier(unit);
}

export function countStoneTilesInTremorsense(unit: Unit, terrainManager: TerrainManager): number {
    const { col: unitCol, row: unitRow } = terrainManager.grid.worldToGrid(unit.x, unit.y);
    const radius = getTremorsenseRadiusTilesForUnit(unit);
    const radiusSq = radius * radius;
    let count = 0;
    for (let row = 0; row < terrainManager.grid.height; row++) {
        for (let col = 0; col < terrainManager.grid.width; col++) {
            const dx = col - unitCol;
            const dy = row - unitRow;
            if ((dx * dx) + (dy * dy) > radiusSq) continue;
            const floor = terrainManager.getFloorTile(col, row);
            const effective = getEffectiveTerrain(floor, terrainManager.grid.get(col, row));
            if (!isOnStone(effective, floor?.destructible)) continue;
            count += 1;
        }
    }
    return count;
}

export function getBedrockScavengerRoundStartArmour(stoneTileCountInTremorsense: number): number {
    return Math.max(0, Math.min(BEDROCK_SCAVENGER_ARMOUR_MAX_PER_ROUND, stoneTileCountInTremorsense));
}
