/**
 * Quest Prep ability loadout helpers: accessible pool, 7 primary slots, free attachments.
 */

import { getAbility } from '../abilities/AbilityRegistry';
import { getItemDef } from '../character_defs/items';
import {
    getCardReplacementsFromResearch,
    getDirectCardsFromResearch,
    getRemovedCardsFromResearch,
    mergeBattleEquipmentIdsFromResearch,
} from '../../../researchTrees/evaluator';

/** Max primary ability slots a player may fill during Quest Prep. */
export const QUEST_PREP_ABILITY_SLOT_COUNT = 7;

/**
 * Ability IDs the Campaign Character currently has access to via equipment + research
 * (same pipeline as battle deck construction before Quest Prep filtering).
 */
export function buildAccessibleAbilityIds(
    equipment: readonly string[],
    researchTrees: Record<string, string[]> | undefined,
): string[] {
    const merged = mergeBattleEquipmentIdsFromResearch([...equipment], researchTrees);
    const equippedIds = [...merged.equipmentIds, ...merged.extraEquippedItemIds];
    const abilities: string[] = [];
    for (const itemId of equippedIds) {
        const item = getItemDef(itemId);
        if (!item) continue;
        for (const cardId of item.cardsToAdd) {
            if (!abilities.includes(cardId)) abilities.push(cardId);
        }
    }
    for (const cardId of getDirectCardsFromResearch(researchTrees)) {
        if (!abilities.includes(cardId)) abilities.push(cardId);
    }
    const removedCardIds = getRemovedCardsFromResearch(researchTrees);
    if (removedCardIds.size > 0) {
        for (let i = abilities.length - 1; i >= 0; i--) {
            if (removedCardIds.has(abilities[i]!)) abilities.splice(i, 1);
        }
    }
    const replacements = getCardReplacementsFromResearch(researchTrees);
    if (replacements.size > 0) {
        for (let i = 0; i < abilities.length; i++) {
            const r = replacements.get(abilities[i]!);
            if (r) abilities[i] = r;
        }
    }
    return abilities;
}

/**
 * Attachments declared on an ability (free companions that do not occupy a prep slot).
 */
export function getAttachedAbilityIds(abilityId: string): readonly string[] {
    const ability = getAbility(abilityId);
    return ability?.attachedAbilityIds ?? [];
}

/** True when `abilityId` is listed as an attachment of some other accessible primary. */
export function isAttachedOnlyAbility(
    abilityId: string,
    accessibleAbilityIds: readonly string[],
): boolean {
    for (const primaryId of accessibleAbilityIds) {
        if (primaryId === abilityId) continue;
        if (getAttachedAbilityIds(primaryId).includes(abilityId)) return true;
    }
    return false;
}

/**
 * Center-pane pool: accessible abilities minus those that only appear as attachments.
 */
export function filterSelectableQuestPrepAbilityIds(
    accessibleAbilityIds: readonly string[],
): string[] {
    return accessibleAbilityIds.filter(
        (id) => !isAttachedOnlyAbility(id, accessibleAbilityIds),
    );
}

/** Expand primary slot picks to include free attached companions (deduped, primaries first). */
export function expandAttachedAbilityIds(primaryIds: readonly string[]): string[] {
    const out: string[] = [];
    for (const id of primaryIds) {
        if (!out.includes(id)) out.push(id);
        for (const attached of getAttachedAbilityIds(id)) {
            if (!out.includes(attached)) out.push(attached);
        }
    }
    return out;
}

/** Add a primary to the next open slot; no-op if full or already selected. */
export function addQuestPrepAbility(
    selectedPrimaryIds: readonly string[],
    abilityId: string,
): string[] {
    if (selectedPrimaryIds.includes(abilityId)) return [...selectedPrimaryIds];
    if (selectedPrimaryIds.length >= QUEST_PREP_ABILITY_SLOT_COUNT) {
        return [...selectedPrimaryIds];
    }
    return [...selectedPrimaryIds, abilityId];
}

/** Remove a primary (and its attached companions leave with it). */
export function removeQuestPrepAbility(
    selectedPrimaryIds: readonly string[],
    abilityId: string,
): string[] {
    return selectedPrimaryIds.filter((id) => id !== abilityId);
}

export function isQuestPrepSlotsFull(selectedPrimaryIds: readonly string[]): boolean {
    return selectedPrimaryIds.length >= QUEST_PREP_ABILITY_SLOT_COUNT;
}
