/**
 * CardManager - Owns per-player card decks, research trees, and
 * ability-use tracking. Handles draw, discard, round-end recharge,
 * and card-transfer logic.
 */

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
    /** Remaining uses before discard. */
    durability: number;
    /** Rounds remaining in discard (rounds-based). */
    discardRoundsRemaining?: number;
    /** Game time when added to discard (seconds-based). */
    discardAddedAtTime?: number;
}

export class CardManager {
    cards: Record<string, CardInstance[]> = {};
    playerResearchTreesByPlayer: Record<string, Record<string, string[]>> = {};
    private abilityUsesThisRound: Map<string, number> = new Map();
    private ctx: EngineContext;
    private cardInstanceSeq = 1;

    constructor(ctx: EngineContext) {
        this.ctx = ctx;
    }

    /** Create a card instance with defaults (durability from card def). Per-engine sequence. */
    createCardInstance(cardDefId: CardDefId, abilityId: string, location: CardInstance['location']): CardInstance {
        const def = getCardDef(cardDefId);
        if (!def) {
            console.error(`ERROR: Unable to get card def (${cardDefId}) for ability id (${abilityId}).`);
        }
        return {
            instanceId: `card-${this.cardInstanceSeq++}`,
            cardDefId,
            abilityId,
            location,
            durability: def?.durability ?? 1,
        };
    }

    private drawCard(playerId: string): number {
        const playerCards = this.cards[playerId];
        if (!playerCards) return 0;
        const handCount = playerCards.filter((c) => c.location === 'hand').length;
        if (handCount >= MAX_HAND_SIZE) return 0;
        const deckCards = playerCards.filter((c) => c.location === 'deck');
        if (deckCards.length === 0) return 0;
        const idx = this.ctx.generateRandomInteger(0, deckCards.length - 1);
        const card = deckCards[idx];
        if (!card) return 0;
        card.location = 'hand';
        return 1;
    }

    drawCardsForPlayer(playerId: string, count: number): number {
        let drawn = 0;
        for (let i = 0; i < count; i++) {
            drawn += this.drawCard(playerId);
        }
        return drawn;
    }

    fillHandInnateFirst(playerId: string, maxHandSize: number): void {
        const playerCards = this.cards[playerId];
        if (!playerCards) return;
        let handCount = playerCards.filter((c) => c.location === 'hand').length;
        const deckCards = playerCards.filter((c) => c.location === 'deck');
        for (const card of deckCards) {
            if (handCount >= maxHandSize) break;
            const def = getCardDef(card.cardDefId);
            if (def?.tags?.includes('innate')) {
                card.location = 'hand';
                handCount++;
            }
        }
        this.drawCardsForPlayer(playerId, maxHandSize - handCount);
    }

    transferCardToAllyDeck(caster: Unit, cardDefId: CardDefId, abilityId: string): void {
        const playerId = caster.ownerId;
        const deck = this.cards[playerId];
        if (!deck) return;
        const allies = this.ctx.getAllies(caster);
        const targetUnit = allies.length > 0
            ? allies[this.ctx.generateRandomInteger(0, allies.length - 1)]
            : caster;
        if (!targetUnit.abilities.includes(abilityId)) {
            targetUnit.abilities.push(abilityId);
        }
        const newCard = this.createCardInstance(cardDefId, abilityId, 'deck');
        const targetPlayerId = targetUnit.ownerId;
        this.cards[targetPlayerId].push(newCard);
    }

    setPlayerResearchTreesByPlayer(map: Record<string, Record<string, string[]>>): void {
        this.playerResearchTreesByPlayer = {};
        for (const [playerId, trees] of Object.entries(map ?? {})) {
            const normalizedTrees: Record<string, string[]> = {};
            for (const [treeId, nodeIds] of Object.entries(trees ?? {})) {
                normalizedTrees[treeId] = Array.isArray(nodeIds) ? [...nodeIds] : [];
            }
            this.playerResearchTreesByPlayer[playerId] = normalizedTrees;
        }
    }

    getPlayerResearchNodes(playerId: string, treeId: string): string[] {
        return this.playerResearchTreesByPlayer[playerId]?.[treeId] ?? [];
    }

    trackAbilityUse(unitId: string, abilityId: string): void {
        const key = `${unitId}:${abilityId}`;
        this.abilityUsesThisRound.set(key, (this.abilityUsesThisRound.get(key) ?? 0) + 1);
    }

    getAbilityUsesThisRound(unitId: string, abilityId: string): number {
        return this.abilityUsesThisRound.get(`${unitId}:${abilityId}`) ?? 0;
    }

    clearAbilityUses(): void {
        this.abilityUsesThisRound.clear();
    }

    toJSON(): {
        cards: Record<string, CardInstance[]>;
        playerResearchTreesByPlayer: Record<string, Record<string, string[]>>;
    } {
        return {
            cards: Object.fromEntries(
                Object.entries(this.cards).map(([pid, cards]) => [
                    pid,
                    cards.map((c) => ({ ...c })),
                ]),
            ),
            playerResearchTreesByPlayer: Object.fromEntries(
                Object.entries(this.playerResearchTreesByPlayer).map(([playerId, trees]) => [
                    playerId,
                    Object.fromEntries(Object.entries(trees).map(([treeId, nodeIds]) => [treeId, [...nodeIds]])),
                ]),
            ),
        };
    }

    restoreFromJSON(
        cardsData: Record<string, SerializedCardInstance[]>,
        researchData?: Record<string, Record<string, string[]>>,
    ): void {
        this.cards = Object.fromEntries(
            Object.entries(cardsData).map(([pid, cards]) => [
                pid,
                cards.map((c) => {
                    const raw = c as SerializedCardInstance & { location?: string; exileRounds?: number };
                    const { exileRounds: _, ...rest } = raw;
                    const rawLoc: string = raw.location ?? 'deck';
                    const loc = rawLoc === 'exile' ? 'deck' : rawLoc;
                    const cardDefId = asCardDefId(raw.abilityId);
                    const def = getCardDef(cardDefId);
                    return {
                        ...rest,
                        cardDefId,
                        location: loc,
                        instanceId: raw.instanceId ?? `card-${this.cardInstanceSeq++}`,
                        durability: raw.durability ?? def?.durability ?? 1,
                    } as CardInstance;
                }),
            ]),
        );

        if (researchData) {
            this.setPlayerResearchTreesByPlayer(researchData);
        }
    }
}
