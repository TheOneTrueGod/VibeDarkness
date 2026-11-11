/**
 * Units held by another unit's cast: a sustained cast behaviour that drives them (`CastBehaviour.getHeldUnitIds`),
 * like Spirit Storm relocating and spinning the caster's pet. A held unit is busy until that window ends.
 * Derived from `activeCastBehaviours` (rebuilt after snapshot restores), so it is deterministic.
 */
import type { Unit } from './Unit';

export function isUnitHeldByCast(unit: Unit, units: readonly Unit[]): boolean {
    for (const caster of units) {
        if (isUnitHeldByCastOf(unit, caster)) return true;
    }
    return false;
}

/** True when one of `holder`'s own running casts holds `unit` (e.g. the pet its Spirit Storm is moving). */
export function isUnitHeldByCastOf(unit: Unit, holder: Unit): boolean {
    for (const [behaviourKey, rec] of holder.activeCastBehaviours) {
        const held = rec.entry.behaviour.getHeldUnitIds?.(rec.active.castBehaviourPayloads?.[behaviourKey]);
        if (held?.includes(unit.id)) return true;
    }
    return false;
}
