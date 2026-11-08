/**
 * Cast hit memory: remembers which units one interval of a cast has already struck, so a later
 * interval of the same cast can skip them ("each unit takes this ability's damage once").
 *
 * Stored on the caster's `ActiveAbility.castBehaviourPayloads` under a reserved `hits:<group>` key,
 * so it is per-cast, cleared when the cast ends, and serialized with checkpoints like any other
 * behaviour payload. Use a `group` name to keep separate hit sets within one cast.
 */

import type { ActiveAbility } from '../game/types';
import type { Unit } from '../game/units/Unit';

const KEY_PREFIX = 'hits:';

function activeCast(caster: Unit, abilityId: string): ActiveAbility | undefined {
    return caster.activeAbilities.find((a) => a.abilityId === abilityId);
}

/** Ids of units this cast has already recorded in `group` (empty when none, or no active cast). */
export function getCastHitIds(caster: Unit, abilityId: string, group = 'default'): ReadonlySet<string> {
    const stored = activeCast(caster, abilityId)?.castBehaviourPayloads?.[KEY_PREFIX + group];
    return new Set(Array.isArray(stored) ? (stored as string[]) : []);
}

/** Records `unitIds` as struck by this cast in `group`. No-op when the caster has no active cast of `abilityId`. */
export function recordCastHits(caster: Unit, abilityId: string, unitIds: Iterable<string>, group = 'default'): void {
    const active = activeCast(caster, abilityId);
    if (!active) return;
    const merged = new Set(getCastHitIds(caster, abilityId, group));
    for (const id of unitIds) merged.add(id);
    if (!active.castBehaviourPayloads) active.castBehaviourPayloads = {};
    active.castBehaviourPayloads[KEY_PREFIX + group] = [...merged];
}
