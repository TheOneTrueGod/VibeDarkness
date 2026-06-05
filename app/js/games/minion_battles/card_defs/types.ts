/**
 * Branded type for card definition IDs. Only IDs that exist in the card def registry
 * should be used as CardDefId (e.g. '0101', '0102', 'throw_knife').
 */
export type CardDefId = string & { _brand: 'CardDefId' };

/** Cast a string to CardDefId. Use for known-valid ids (e.g. from CardDef.id or abilityId). */
export function asCardDefId(s: string): CardDefId {
    return s as CardDefId;
}

/** Maps an ability to a card entry in the registry. */
export interface CardDef {
    /** The ability this card activates (looked up in AbilityRegistry). */
    abilityId: string;
}
