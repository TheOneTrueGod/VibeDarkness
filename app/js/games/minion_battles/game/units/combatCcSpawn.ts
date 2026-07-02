import type { Unit } from './Unit';
import { getUnitCombatCcDef } from './unit_defs/unitDef';
import { UnitTag } from './unitTag';

/**
 * Merge unit-def and boss-tag crowd control baselines onto a freshly spawned unit.
 * Call after `tags` are set on the unit.
 */
export function applyCombatCrowdControlProfile(unit: Unit): void {
    const def = getUnitCombatCcDef(unit.characterId);
    const isBoss = unit.tags.includes(UnitTag.Boss);

    if (def?.ccDurationResistPct) {
        unit.ccArmour.durationResistPct = { ...def.ccDurationResistPct };
    }
    if (def?.ccDurationFlatSec) {
        unit.ccArmour.durationFlatSec = { ...def.ccDurationFlatSec };
    }

    unit.ccArmour.hardFloor = def?.hardCcArmourFloor ?? (isBoss ? 1 : 0);
    unit.ccArmour.breakStunDuration = def?.ccArmourBreakStunDuration ?? 0;
    unit.ccArmour.chainResist = def?.chainCcResist ?? (isBoss ? 1 : 0);
    unit.ccArmour.chainDecayRounds = def?.chainCcDecayRounds ?? 1;
}
