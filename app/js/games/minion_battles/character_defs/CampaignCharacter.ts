/**
 * Campaign character instance created from server data.
 * Provides helpers for mission eligibility and starter battle cards.
 */

import type { CampaignCharacterData, CharacterDisallowReason } from './campaignCharacterTypes';
import { getItemDef } from './items';

export interface MissionTraitFilter {
    allowedTraits?: string[];
    disallowedTraits?: string[];
}

/**
 * Create a CampaignCharacter instance from the serializable object from the server.
 */
export function fromCampaignCharacterData(data: CampaignCharacterData): CampaignCharacter {
    return new CampaignCharacter(data);
}

export class CampaignCharacter {
    readonly id: string;
    readonly ownerAccountId: number | undefined;
    readonly name: string;
    readonly equipment: string[];
    readonly knowledge: Record<string, Record<string, unknown>>;
    readonly traits: string[];
    readonly portraitId: string;
    readonly battleChipDetails: Record<string, unknown>;
    readonly campaignId: string;
    readonly missionId: string;

    constructor(data: CampaignCharacterData) {
        this.id = data.id;
        this.ownerAccountId = data.ownerAccountId;
        this.name = typeof data.name === 'string' && data.name !== '' ? data.name : 'Adventurer';
        this.equipment = Array.isArray(data.equipment) ? [...data.equipment] : [];
        this.knowledge =
            data.knowledge && typeof data.knowledge === 'object' ? { ...data.knowledge } : {};
        this.traits = Array.isArray(data.traits) ? [...data.traits] : [];
        this.portraitId = typeof data.portraitId === 'string' ? data.portraitId : '';
        this.battleChipDetails =
            data.battleChipDetails && typeof data.battleChipDetails === 'object'
                ? { ...data.battleChipDetails }
                : {};
        this.campaignId = typeof data.campaignId === 'string' ? data.campaignId : '';
        this.missionId = typeof data.missionId === 'string' ? data.missionId : '';
    }

    /**
     * Build the starter battle cards for this character from equipped items only.
     * All cards come from equipment (e.g. core + weapon/utility items).
     */
    getBattleCards(extraEquippedItemIds: string[] = []): string[] {
        const cards: string[] = [];
        const allItemIds = new Set<string>([...this.equipment, ...extraEquippedItemIds]);
        for (const itemId of allItemIds) {
            const itemDef = getItemDef(itemId);
            if (!itemDef) continue;
            for (const entry of itemDef.cardsToAdd) {
                for (let i = 0; i < entry.count; i++) {
                    cards.push(entry.cardId);
                }
            }
        }
        return cards;
    }

    /**
     * Returns true if this character can be used on the given campaign (and optionally mission).
     * Same campaign is required; mission trait filters (allowedTraits / disallowedTraits) are applied when provided.
     */
    canBeUsedOnMission(
        campaignId: string,
        _missionId?: string,
        missionDef?: MissionTraitFilter | null,
    ): boolean {
        if (this.campaignId !== campaignId) {
            return false;
        }
        if (missionDef) {
            if (missionDef.disallowedTraits?.length) {
                const hasDisallowed = this.traits.some((t) =>
                    missionDef.disallowedTraits!.includes(t),
                );
                if (hasDisallowed) return false;
            }
            if (missionDef.allowedTraits?.length) {
                const hasAllowed = this.traits.some((t) => missionDef.allowedTraits!.includes(t));
                if (!hasAllowed) return false;
            }
        }
        return true;
    }

    /**
     * Returns a one-word reason the character is disallowed, or null if allowed.
     */
    getDisallowReason(
        campaignId: string,
        _missionId?: string,
        missionDef?: MissionTraitFilter | null,
    ): CharacterDisallowReason | null {
        if (this.campaignId !== campaignId) {
            return 'campaign';
        }
        if (missionDef?.disallowedTraits?.length) {
            const hasDisallowed = this.traits.some((t) =>
                missionDef.disallowedTraits!.includes(t),
            );
            if (hasDisallowed) return 'disallowed';
        }
        if (missionDef?.allowedTraits?.length) {
            const hasAllowed = this.traits.some((t) => missionDef.allowedTraits!.includes(t));
            if (!hasAllowed) return 'allowed';
        }
        return null;
    }

    toJSON(): CampaignCharacterData {
        return {
            id: this.id,
            ownerAccountId: this.ownerAccountId,
            name: this.name,
            equipment: this.equipment,
            knowledge: this.knowledge,
            traits: this.traits,
            portraitId: this.portraitId,
            battleChipDetails: this.battleChipDetails as CampaignCharacterData['battleChipDetails'],
            campaignId: this.campaignId,
            missionId: this.missionId,
        };
    }
}
