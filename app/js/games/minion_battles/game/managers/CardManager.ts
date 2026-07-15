import { getCardDef, asCardDefId } from '../../card_defs';
import type { CardDefId } from '../../card_defs';
import type { EngineContext } from '../EngineContext';
import type { SerializedCardInstance } from '../types';

/** Maximum cards in hand. Draw at round start if below this. */
export const MAX_HAND_SIZE = 6;

/** Number of cards drawn at the beginning of each round. */
export const CARDS_PER_ROUND = 2;

/** Card instance tracked per player. */
export interface CardInstance {
    instanceId: string;
    cardDefId: CardDefId;
    abilityId: string;
    location: 'hand' | 'deck' | 'discard';
    /** Rounds remaining in discard (rounds-based). */
    discardRoundsRemaining?: number;
    /** Game time when added to discard (seconds-based). */
    discardAddedAtTime?: number;
}

export class CardManager {
    cards: Record<string, CardInstance[]> = {};
    private ctx: EngineContext;
    private cardInstanceSeq = 1;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    /** Create a card instance. Per-engine sequence. */
    createCardInstance(cardDefId: CardDefId, abilityId: string, location: CardInstance['location']): CardInstance {
        const def = getCardDef(abilityId);
        if (!def) {
            console.error(`ERROR: Unable to get card def (${cardDefId}) for ability id (${abilityId}).`);
        }
        return {
            instanceId: `card-${this.cardInstanceSeq++}`,
            cardDefId,
            abilityId,
            location,
        };
    }

    toJSON(): {
        cards: Record<string, CardInstance[]>;
    } {
        return {
            cards: Object.fromEntries(
                Object.entries(this.cards).map(([pid, cards]) => [
                    pid,
                    cards.map((c) => ({ ...c })),
                ]),
            ),
        };
    }

    restoreFromJSON(cardsData: Record<string, SerializedCardInstance[]>): void {
        this.cards = Object.fromEntries(
            Object.entries(cardsData).map(([pid, cards]) => [
                pid,
                cards.map((c) => {
                    const raw = c as SerializedCardInstance & { location?: string; exileRounds?: number };
                    const { exileRounds: _, ...rest } = raw;
                    const rawLoc: string = raw.location ?? 'deck';
                    const loc = rawLoc === 'exile' ? 'deck' : rawLoc;
                    const cardDefId = asCardDefId(raw.abilityId);
                    return {
                        ...rest,
                        cardDefId,
                        location: loc,
                        instanceId: raw.instanceId ?? `card-${this.cardInstanceSeq++}`,
                    } as CardInstance;
                }),
            ]),
        );
    }
}
