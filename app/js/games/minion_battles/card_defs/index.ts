import type { CardDef } from './types';
import exampleCard from './example_card';

const cardDefs: CardDef[] = [exampleCard];

/** Map card ID -> card definition for resolving hands (arrays of card IDs) to card data. */
export const CARD_DEF_MAP: Map<string, CardDef> = new Map(cardDefs.map((c) => [c.id, c]));

export function getCardDef(id: string): CardDef | undefined {
    return CARD_DEF_MAP.get(id);
}

export type { CardDef } from './types.js';
