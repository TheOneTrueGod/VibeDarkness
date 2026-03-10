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
 * Discard duration configuration: how long a card stays in discard before returning to the deck.
 * When unit is 'never', the card is not added to the discard pile at all (consumed).
 */
export type DiscardDuration =
    | { duration: number; unit: 'rounds' }
    | { duration: number; unit: 'seconds' }
    | { unit: 'never' };

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
    /** Number of uses before the card is discarded. Default 1. */
    durability?: number;
    /** How long the card stays in discard before returning to the deck. Default: 1 round. */
    discardDuration?: DiscardDuration;
    /** Optional tags (e.g. 'innate' = drawn first when filling starting hand). */
    tags?: string[];
}
