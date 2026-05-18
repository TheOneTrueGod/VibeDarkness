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
        unit.ccDurationResistPct = { ...def.ccDurationResistPct };
    }
    if (def?.ccDurationFlatSec) {
        unit.ccDurationFlatSec = { ...def.ccDurationFlatSec };
    }

    unit.hardCcArmourFloor = def?.hardCcArmourFloor ?? (isBoss ? 1 : 0);
    unit.ccArmourBreakStunDuration = def?.ccArmourBreakStunDuration ?? 0;
    unit.chainCcResist = def?.chainCcResist ?? (isBoss ? 1 : 0);
    unit.chainCcDecayRounds = def?.chainCcDecayRounds ?? 1;
}
