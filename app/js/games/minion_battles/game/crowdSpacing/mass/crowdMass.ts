/**
 * CrowdSpacing mass for the mass resolver. Pure data: def override, else size tier, then the boss multiplier.
 */

import type { Unit } from '../../units/Unit';
import { UnitTag, hasUnitTag } from '../../units/unitTag';
import { UNIT_SIZE_MAP, type UnitSize } from '../../units/unit_defs/unitConstants';
import { getUnitDefSize } from '../../units/unit_defs/unitDef';
import {
    CROWD_MASS_BOSS_MULTIPLIER,
    CROWD_MASS_BY_SIZE,
    nearestUnitSizeForRadius,
} from './massConstants';

/**
 * The unit's size tier for mass: its def `size` when the unit's radius still matches it, otherwise the
 * tier nearest its actual radius (units without a def size, portrait / per-spawn radius overrides).
 */
export function getCrowdSizeTier(unit: Pick<Unit, 'characterId' | 'radius'>): UnitSize {
    const defSize = getUnitDefSize(unit.characterId);
    if (defSize && UNIT_SIZE_MAP[defSize] === unit.radius) return defSize;
    return nearestUnitSizeForRadius(unit.radius);
}

/**
 * CrowdSpacing mass: def `crowdMass` override if set, else the size-tier mass (`CROWD_MASS_BY_SIZE`),
 * multiplied by `CROWD_MASS_BOSS_MULTIPLIER` when the unit is tagged `Boss`.
 * Bracing (infinite mass) and team resistance are applied by the resolver, not here.
 */
export function getCrowdMass(unit: Unit): number {
    const base = unit.crowdMassOverride ?? CROWD_MASS_BY_SIZE[getCrowdSizeTier(unit)];
    return hasUnitTag(unit, UnitTag.Boss) ? base * CROWD_MASS_BOSS_MULTIPLIER : base;
}
