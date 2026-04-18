/**
 * Runtime tags on battle {@link Unit} instances (visibility, UI, etc.).
 * Serialized on checkpoints when present; unknown strings from JSON are dropped.
 */

export enum UnitTag {
    /** Player near a living Crystal; enemies treat this unit as not visible for targeting. */
    ProtectedByCrystal = 'protectedByCrystal',
    /** Boss unit — e.g. arcade boss HP bar in battle UI. */
    Boss = 'boss',
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
