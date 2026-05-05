import type { Unit } from '../game/units/Unit';
import type { CcType } from './ccTypes';

/**
 * Duration after CC resist: max(0, base * (1 - pct) - flat).
 * Lookup: specific CcType, then ALL (same rule as percent).
 */
export function resolveCcDuration(unit: Unit, ccType: CcType, baseSeconds: number): number {
    const pct = unit.ccDurationResistPct[ccType] ?? unit.ccDurationResistPct.ALL ?? 0;
    const flat = unit.ccDurationFlatSec[ccType] ?? unit.ccDurationFlatSec.ALL ?? 0;
    return Math.max(0, baseSeconds * (1 - pct) - flat);
}
