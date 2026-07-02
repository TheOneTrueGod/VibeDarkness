import type { Unit } from '../game/units/Unit';
import type { CcType } from './ccTypes';

/**
 * Duration after CC resist: max(0, base * (1 - pct) - flat).
 * Lookup: specific CcType, then ALL (same rule as percent).
 */
export function resolveCcDuration(unit: Unit, ccType: CcType, baseSeconds: number): number {
    const pct = unit.ccArmour.durationResistPct[ccType] ?? unit.ccArmour.durationResistPct.ALL ?? 0;
    const flat = unit.ccArmour.durationFlatSec[ccType] ?? unit.ccArmour.durationFlatSec.ALL ?? 0;
    return Math.max(0, baseSeconds * (1 - pct) - flat);
}
