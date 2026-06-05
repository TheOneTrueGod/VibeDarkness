/**
 * Branded type for card definition IDs. Only IDs that exist in the card def registry
 * should be used as CardDefId (e.g. '0101', '0102', 'throw_knife').
 */
export type CardDefId = string & { _brand: 'CardDefId' };

/** Cast a string to CardDefId. Use for known-valid ids (e.g. from CardDef.id or abilityId). */
export function asCardDefId(s: string): CardDefId {
    return s as CardDefId;
}

/**
 * Card definition shape.
 *
 * Each card def references an ability by ID. Display information
 * (name, image, description) is pulled from the ability at runtime.
 * The card def adds an ID for tracking individual card instances.
 */
export interface CardDef {
    /** Unique card definition ID (must exist in registry). */
    id: CardDefId;
    /** Display name (may differ from ability name for flavor variants). */
    name: string;
    /** The ability this card activates (looked up in AbilityRegistry). */
    abilityId: string;
    /** Optional tags (e.g. 'innate' = drawn first when filling starting hand). */
    tags?: string[];
}
