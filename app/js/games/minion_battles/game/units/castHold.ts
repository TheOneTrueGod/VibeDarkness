/**
 * Units held by another unit's cast: a sustained cast behaviour that drives them (`CastBehaviour.getHeldUnitIds`),
 * like Spirit Storm relocating and spinning the caster's pet. A held unit is busy until that window ends.
 * Derived from `activeCastBehaviours` (rebuilt after snapshot restores), so it is deterministic.
 */
import type { Unit } from './Unit';

export function isUnitHeldByCast(unit: Unit, units: readonly Unit[]): boolean {
    for (const caster of units) {
        for (const [behaviourKey, rec] of caster.activeCastBehaviours) {
            const held = rec.entry.behaviour.getHeldUnitIds?.(rec.active.castBehaviourPayloads?.[behaviourKey]);
            if (held?.includes(unit.id)) return true;
        }
    }
    return false;
}
