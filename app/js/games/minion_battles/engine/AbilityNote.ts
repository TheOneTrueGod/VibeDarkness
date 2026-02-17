/**
 * Ability notes - per-ability data that the currently used ability can set on the unit.
 * Strictly typed and narrowed by abilityId.
 */

/** Map of ability ID -> note payload. Extend this when adding abilities that set notes. */
export interface AbilityNoteMap {
    '0001': { position: { x: number; y: number } };
}

/** Discriminated union: { abilityId: K, abilityNote: AbilityNoteMap[K] } for each K. */
export type AbilityNote = {
    [K in keyof AbilityNoteMap]: { abilityId: K; abilityNote: AbilityNoteMap[K] };
}[keyof AbilityNoteMap];

/** Get the note type for a specific ability ID. */
export type AbilityNoteType<K extends keyof AbilityNoteMap> = AbilityNoteMap[K];

/** Type guard: narrow AbilityNote to a specific ability id. */
export function isAbilityNote<K extends keyof AbilityNoteMap>(
    note: AbilityNote | null,
    abilityId: K,
): note is { abilityId: K; abilityNote: AbilityNoteMap[K] } {
    return note !== null && note.abilityId === abilityId;
}
