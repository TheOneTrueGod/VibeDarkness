/**
 * UnitFilter matching — characterId, creatureType, and tags with AND semantics.
 */

import { getCreatureType, getUnitStaticTags } from '../games/minion_battles/game/units/unit_defs/unitDef';
import type { UnitTag } from '../games/minion_battles/game/units/unitTag';
import type { UnitFilter, UnitFilterSubject } from './types';

function resolveCreatureType(subject: UnitFilterSubject) {
    if (subject.creatureType !== undefined) return subject.creatureType;
    return getCreatureType(subject.characterId);
}

/**
 * Tags on the subject: prefer explicit `tags`, else static def tags for `characterId`.
 * Runtime units should pass their live `tags` array.
 */
function resolveTags(subject: UnitFilterSubject): readonly UnitTag[] {
    if (subject.tags !== undefined) return subject.tags;
    return getUnitStaticTags(subject.characterId);
}

/**
 * Returns true when `subject` matches every set field on `filter` (AND).
 * An empty / undefined filter matches everything.
 */
export function matchesUnitFilter(
    subject: UnitFilterSubject,
    filter: UnitFilter | undefined | null,
): boolean {
    if (!filter) return true;

    if (filter.characterId !== undefined && subject.characterId !== filter.characterId) {
        return false;
    }

    if (filter.creatureType !== undefined && resolveCreatureType(subject) !== filter.creatureType) {
        return false;
    }

    if (filter.tags !== undefined && filter.tags.length > 0) {
        const tags = resolveTags(subject);
        for (const required of filter.tags) {
            if (!tags.includes(required)) return false;
        }
    }

    return true;
}
