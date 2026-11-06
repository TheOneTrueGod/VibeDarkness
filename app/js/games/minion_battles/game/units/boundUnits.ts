/**
 * Bound units: units that belong to a master of another character type on the same team (the Court
 * Magician's crystals, the Displacer Spirit's clones). A def opts in with `UnitDefEntry.boundToCharacterId`;
 * the master's abilities find its units with `getBoundUnits`, and a bound unit fades when no master of
 * that type is left (`despawnIfMasterGone`, called from the bound unit's AI).
 */

import type { Unit } from './Unit';
import { getUnitDefEntry, type UnitDefId } from './unit_defs/unitDef';

/** Living units of `characterId` on `owner`'s team (never `owner` itself), in engine order. */
export function getBoundUnits(units: readonly Unit[], owner: Unit, characterId: string): Unit[] {
    return units.filter(
        (u) => u.id !== owner.id && u.isAlive() && u.characterId === characterId && u.teamId === owner.teamId,
    );
}

/** Master character id a bound unit belongs to (`UnitDefEntry.boundToCharacterId`), if any. */
export function getBoundMasterCharacterId(unit: Unit): string | undefined {
    return getUnitDefEntry(unit.characterId as UnitDefId)?.boundToCharacterId;
}

/**
 * When no living `masterCharacterId` unit remains on `unit`'s team, schedule `unit` to despawn now
 * (same path as ephemeral summons) and return true.
 */
export function despawnIfMasterGone(
    unit: Unit,
    context: { getUnits(): Unit[]; gameTime: number },
    masterCharacterId: string,
): boolean {
    const masterAlive = context
        .getUnits()
        .some((u) => u.isAlive() && u.characterId === masterCharacterId && u.teamId === unit.teamId);
    if (masterAlive) return false;
    unit.ephemeralDespawnAtGameTime = context.gameTime;
    return true;
}
