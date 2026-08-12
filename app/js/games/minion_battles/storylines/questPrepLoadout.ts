/**
 * Prep ability loadout helpers (Quest Prep + regular mission Prepare Carefully):
 * accessible pool, primary slots, secondary/attached companions.
 */

import { abilityHasTag } from '../abilities/Ability';
import { getAbility } from '../abilities/AbilityRegistry';
import { getItemDef } from '../character_defs/items';
import {
    getCardReplacementsFromResearch,
    getDirectCardsFromResearch,
    getRemovedCardsFromResearch,
    mergeBattleEquipmentIdsFromResearch,
} from '../../../researchTrees/evaluator';

/** Max primary ability slots a player may fill during Quest Prep / mission ability selection. */
export const PREP_ABILITY_SLOT_COUNT = 7;

/** @deprecated Prefer PREP_ABILITY_SLOT_COUNT — same value. */
export const QUEST_PREP_ABILITY_SLOT_COUNT = PREP_ABILITY_SLOT_COUNT;

/**
 * Ability IDs the Campaign Character currently has access to via equipment + research
 * (same pipeline as battle deck construction before prep filtering).
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

/** True when the ability is tagged `secondary` (granted by another ability; not a prep pick). */
export function isSecondaryAbility(abilityId: string): boolean {
    return abilityHasTag(abilityId, 'secondary');
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
 * Center-pane pool: accessible abilities minus secondaries and attachment-only companions.
 */
export function filterSelectableQuestPrepAbilityIds(
    accessibleAbilityIds: readonly string[],
): string[] {
    return accessibleAbilityIds.filter(
        (id) => !isSecondaryAbility(id) && !isAttachedOnlyAbility(id, accessibleAbilityIds),
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
    if (selectedPrimaryIds.length >= PREP_ABILITY_SLOT_COUNT) {
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
    return selectedPrimaryIds.length >= PREP_ABILITY_SLOT_COUNT;
}

/** Mission Prepare Carefully: selection UI only when over the primary slot cap. */
export function needsMissionAbilitySelection(selectableCount: number): boolean {
    return selectableCount > PREP_ABILITY_SLOT_COUNT;
}

/** Mission Prepare Carefully: all primaries auto-brought; picker hidden; unselect disabled. */
export function isMissionPrepReadOnly(selectableCount: number): boolean {
    return selectableCount <= PREP_ABILITY_SLOT_COUNT;
}

/**
 * Ready gate for mission ability loadout.
 * At/under cap: all selectable primaries must be selected (auto).
 * Over cap: exactly PREP_ABILITY_SLOT_COUNT primaries required.
 */
export function isMissionPrepAbilityReady(
    selectedPrimaryIds: readonly string[],
    selectableIds: readonly string[],
): boolean {
    if (selectableIds.length <= PREP_ABILITY_SLOT_COUNT) {
        if (selectedPrimaryIds.length !== selectableIds.length) return false;
        return selectableIds.every((id) => selectedPrimaryIds.includes(id));
    }
    return selectedPrimaryIds.length >= PREP_ABILITY_SLOT_COUNT;
}

/**
 * Initial prep selection (Quest Prep + mission Prepare Carefully):
 * under/at cap → all selectable;
 * over cap with remembered picks → remembered ids that are still selectable (up to slot count);
 * over cap with no previous loadout → first {@link PREP_ABILITY_SLOT_COUNT} selectable.
 */
export function resolveInitialMissionSelection(
    selectableIds: readonly string[],
    rememberedIds: readonly string[],
): string[] {
    if (selectableIds.length <= PREP_ABILITY_SLOT_COUNT) {
        return [...selectableIds];
    }
    const remembered = rememberedIds.filter((id) => selectableIds.includes(id));
    if (remembered.length === 0) {
        return selectableIds.slice(0, PREP_ABILITY_SLOT_COUNT);
    }
    return remembered.slice(0, PREP_ABILITY_SLOT_COUNT);
}
