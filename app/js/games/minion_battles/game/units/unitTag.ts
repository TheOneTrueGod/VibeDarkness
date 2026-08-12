/**
 * Runtime tags on battle {@link Unit} instances (visibility, UI, etc.).
 * Serialized on checkpoints when present; unknown strings from JSON are dropped.
 */

import type { Unit } from './Unit';

export enum UnitTag {
    /** Player near a living Crystal; enemies treat this unit as not visible for targeting. */
    ProtectedByCrystal = 'protectedByCrystal',
    /** Boss unit — e.g. arcade boss HP bar in battle UI. */
    Boss = 'boss',
    /** Boar enemy — used for objective marker targeting. */
    Boar = 'boar',
    /** Unit cannot be targeted, takes no damage, and shows no health bar. */
    Invincible = 'invincible',
    /** Boss is enraged — triggers alternate ability set and increased aggression. */
    Enraged = 'enraged',
    /** Stationary structure (e.g. a lanternite_nest or swarm_nest) — the generic "is this a
     *  structure" signal for AI trees that need to find/target enemy structures. */
    Structure = 'structure',
    /**
     * Heavy / boss-scale unit that occupies CrowdSpacing space but is never displaced by it.
     * Independent of {@link UnitTag.Boss} — apply wherever a unit must stand its ground.
     */
    CrowdSpacingAnchor = 'crowdSpacingAnchor',
}

const UNIT_TAG_VALUES = new Set<string>(Object.values(UnitTag));

/** Returns true if `value` is a known {@link UnitTag}. */
export function isUnitTag(value: string): value is UnitTag {
    return UNIT_TAG_VALUES.has(value);
}

/** Parse checkpoint / wire `tags` into only known enum values. */
export function parseUnitTagsFromJSON(raw: unknown): UnitTag[] {
    if (!Array.isArray(raw)) return [];
    const out: UnitTag[] = [];
    for (const item of raw) {
        if (typeof item === 'string' && isUnitTag(item)) out.push(item);
    }
    return out;
}

export function hasUnitTag(unit: Unit, tag: UnitTag): boolean {
    return unit.tags.includes(tag);
}

export function addUnitTag(unit: Unit, tag: UnitTag): void {
    if (!unit.tags.includes(tag)) {
        unit.tags = [...unit.tags, tag];
    }
}

export function removeUnitTag(unit: Unit, tag: UnitTag): void {
    unit.tags = unit.tags.filter((t) => t !== tag);
}
