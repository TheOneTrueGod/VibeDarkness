/**
 * Prep ability loadout helpers (Quest Prep + regular mission Prepare Carefully):
 * accessible pool, primary slots, secondary/attached companions.
 */

import { abilityHasTag } from '../abilities/Ability';
import { getAbility } from '../abilities/AbilityRegistry';
import { resolveCharacterLoadout } from '../character_defs/characterLoadout';

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
    return resolveCharacterLoadout(equipment, researchTrees).abilityIds;
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

/**
 * Expand primary slot picks to include free attached companions (deduped, primaries first).
 *
 * When `accessibleAbilityIds` is provided, companions are only added if they appear in that
 * pool (e.g. Imbued Mace after Light Imbuement research). Omit it to expand every attachment.
 */
export function expandAttachedAbilityIds(
    primaryIds: readonly string[],
    accessibleAbilityIds?: readonly string[],
): string[] {
    const out: string[] = [];
    for (const id of primaryIds) {
        if (!out.includes(id)) out.push(id);
        const primaryAbility = getAbility(id);
        const nestedFallbackId = primaryAbility?.keywords?.nestedCard?.fallbackAbilityId;
        const modeSwapIds = Object.values(primaryAbility?.abilityModes?.modeAbilityIds ?? {});
        for (const attached of getAttachedAbilityIds(id)) {
            // In battle the nested-card parent already occupies that bar slot via fallback swap.
            if (nestedFallbackId && attached === nestedFallbackId) continue;
            // Mode-swap abilities share the parent's bar slot (toggle button) - no slot of their own.
            if (modeSwapIds.includes(attached)) continue;
            if (accessibleAbilityIds && !accessibleAbilityIds.includes(attached)) continue;
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

/**
 * Put `abilityId` into slot `slotIndex`: an occupied slot swaps its primary out for it, an empty
 * slot (index past the last pick) fills the next open slot. Already-selected ids are unchanged.
 */
export function placeQuestPrepAbilityAt(
    selectedPrimaryIds: readonly string[],
    slotIndex: number,
    abilityId: string,
): string[] {
    if (selectedPrimaryIds.includes(abilityId) || slotIndex < 0) return [...selectedPrimaryIds];
    if (slotIndex < selectedPrimaryIds.length) {
        const next = [...selectedPrimaryIds];
        next[slotIndex] = abilityId;
        return next;
    }
    return addQuestPrepAbility(selectedPrimaryIds, abilityId);
}

/** Remove a primary (and its attached companions leave with it). */
export function removeQuestPrepAbility(
    selectedPrimaryIds: readonly string[],
    abilityId: string,
): string[] {
    return selectedPrimaryIds.filter((id) => id !== abilityId);
}

/**
 * Move the primary at `fromIndex` into the gap `insertIndex` (0 = before the first card,
 * `length` = after the last). Out-of-range or no-op moves return an unchanged copy.
 */
export function moveQuestPrepAbility(
    selectedPrimaryIds: readonly string[],
    fromIndex: number,
    insertIndex: number,
): string[] {
    const next = [...selectedPrimaryIds];
    if (fromIndex < 0 || fromIndex >= next.length) return next;
    if (insertIndex < 0 || insertIndex > next.length) return next;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(insertIndex > fromIndex ? insertIndex - 1 : insertIndex, 0, moved!);
    return next;
}

/**
 * Read-only (under/at cap) loadouts always hold every selectable primary, but keep the player's
 * chosen order: requested ids that are still selectable first, then any missing ones appended.
 */
export function readOnlyPrepSelection(
    requestedIds: readonly string[],
    selectableIds: readonly string[],
): string[] {
    const kept = requestedIds.filter((id, i) => selectableIds.includes(id) && requestedIds.indexOf(id) === i);
    return [...kept, ...selectableIds.filter((id) => !kept.includes(id))];
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

/** Copy of research trees with `nodeId` present on `treeId` (idempotent). */
export function researchTreesWithGrantedNode(
    trees: Record<string, string[]> | undefined,
    treeId: string,
    nodeId: string,
): Record<string, string[]> {
    const next: Record<string, string[]> = { ...(trees ?? {}) };
    const existing = next[treeId] ?? [];
    if (!existing.includes(nodeId)) {
        next[treeId] = [...existing, nodeId];
    }
    return next;
}

/**
 * Fill empty prep slots with abilities that became selectable after a research grant.
 * Keeps current picks that are still selectable. Does not backfill abilities the player
 * already skipped when they built the loadout.
 */
export function fillEmptyPrepSlotsWithNewAbilities(
    selectedPrimaryIds: readonly string[],
    previousSelectableIds: readonly string[],
    nextSelectableIds: readonly string[],
): string[] {
    const nextSet = new Set(nextSelectableIds);
    const previousSet = new Set(previousSelectableIds);
    const filled: string[] = selectedPrimaryIds.filter((id) => nextSet.has(id));
    for (const id of nextSelectableIds) {
        if (filled.length >= PREP_ABILITY_SLOT_COUNT) break;
        if (previousSet.has(id) || filled.includes(id)) continue;
        filled.push(id);
    }
    return filled;
}

export type PrepLoadoutAfterResearchGrantParams = {
    selectedPrimaryIds: readonly string[];
    equipment: readonly string[];
    researchTrees: Record<string, string[]> | undefined;
    treeId: string;
    nodeId: string;
};

/**
 * Prep loadout after granting one research node: auto-fill empty slots with newly
 * granted primaries (same behaviour as Prepare Carefully under the slot cap).
 */
export function prepLoadoutAfterResearchGrant(
    params: PrepLoadoutAfterResearchGrantParams,
): string[] {
    const previousSelectable = filterSelectableQuestPrepAbilityIds(
        buildAccessibleAbilityIds(params.equipment, params.researchTrees),
    );
    const nextSelectable = filterSelectableQuestPrepAbilityIds(
        buildAccessibleAbilityIds(
            params.equipment,
            researchTreesWithGrantedNode(params.researchTrees, params.treeId, params.nodeId),
        ),
    );
    const selected =
        params.selectedPrimaryIds.length > 0
            ? params.selectedPrimaryIds
            : resolveInitialMissionSelection(previousSelectable, []);
    return fillEmptyPrepSlotsWithNewAbilities(selected, previousSelectable, nextSelectable);
}

export type CurrentPrepLoadoutParams = {
    playerId: string;
    characterId: string | undefined;
    missionPrepLoadoutsByPlayer?: Record<string, string[]>;
    questPrepLoadoutsByPlayer?: Record<string, string[]>;
    questAbilityLoadoutsByCharacterId?: Record<string, string[]>;
};

/** Frozen Quest Prep loadout if present; otherwise Prepare Carefully picks. */
export function currentPrepLoadoutForPlayer(params: CurrentPrepLoadoutParams): string[] {
    const quest =
        params.questPrepLoadoutsByPlayer?.[params.playerId]
        ?? (params.characterId ? params.questAbilityLoadoutsByCharacterId?.[params.characterId] : undefined);
    if (quest && quest.length > 0) {
        return [...quest];
    }
    const mission = params.missionPrepLoadoutsByPlayer?.[params.playerId];
    return mission && mission.length > 0 ? [...mission] : [];
}

function sameIdList(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
}

/**
 * Loadout to persist with a research-granting story/quest choice, or `undefined`
 * when empty slots do not change.
 */
export function prepLoadoutPrimaryIdsForResearchGrant(
    params: CurrentPrepLoadoutParams & Omit<PrepLoadoutAfterResearchGrantParams, 'selectedPrimaryIds'>,
): string[] | undefined {
    const selected = currentPrepLoadoutForPlayer(params);
    const next = prepLoadoutAfterResearchGrant({
        selectedPrimaryIds: selected,
        equipment: params.equipment,
        researchTrees: params.researchTrees,
        treeId: params.treeId,
        nodeId: params.nodeId,
    });
    if (next.length === 0 || sameIdList(next, selected)) {
        return undefined;
    }
    return next;
}
