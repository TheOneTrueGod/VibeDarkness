/**
 * Discard duration configuration: how long a card stays in discard before returning to the deck.
 */
export type DiscardDuration =
    | { duration: number; unit: 'rounds' }
    | { duration: number; unit: 'seconds' };

/**
 * Card definition shape.
 *
 * Each card def references an ability by ID. Display information
 * (name, image, description) is pulled from the ability at runtime.
 * The card def adds an ID for tracking individual card instances.
 */
export interface CardDef {
    /** Unique card definition ID. */
    id: string;
    /** Display name (may differ from ability name for flavor variants). */
    name: string;
    /** The ability this card activates (looked up in AbilityRegistry). */
    abilityId: string;
    /** Number of uses before the card is discarded. Default 1. */
    durability?: number;
    /** How long the card stays in discard before returning to the deck. Default: 1 round. */
    discardDuration?: DiscardDuration;
}
