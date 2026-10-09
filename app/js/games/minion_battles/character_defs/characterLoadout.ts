/**
 * The one place that turns equipment + research into a character's ability list.
 * Used by battle setup (BaseMissionDef) and by Quest Prep / Prepare Carefully.
 *
 * Phases:
 *  1. Active research (inactive bound weapon trees dropped, virtual roots added).
 *  2. Core-only equipment swaps from research.
 *  3. Each equipped item's `cardsToAdd`.
 *  4. Bound (weapon) tree card effects: addCard, removeCard, chained replaceCard.
 *  5. Unbound tree (cores, training, misc) card effects, same order.
 *  6. Fallback when nothing resulted.
 *
 * Replacement maps are built per phase so a later tree can never overwrite an earlier
 * tree's replacement for the same `fromCardId`.
 */
import { getActiveResearchNodeLevels, getActiveResearchTrees } from '../../../researchTrees/activeResearch';
import {
    applyCardReplacements,
    getCardReplacementsFromResearch,
    getDirectCardsFromResearch,
    getRemovedCardsFromResearch,
    mergeBattleEquipmentIdsFromResearch,
    type TreePredicate,
} from '../../../researchTrees/evaluator';
import { getItemDef } from './items';

/**
 * Active research for every player (see `getActiveResearchTrees`). Idempotent: applying it to
 * already-active research changes nothing. Players with equipment but no stored research still
 * get their virtual weapon root. Players only present in `researchByPlayer` use empty equipment.
 */
export function activeResearchByPlayer(
    equipmentByPlayer: Record<string, readonly string[]> | undefined,
    researchByPlayer: Record<string, Record<string, string[]>> | undefined,
): Record<string, Record<string, string[]>> {
    const out: Record<string, Record<string, string[]>> = {};
    const ids = new Set([
        ...Object.keys(equipmentByPlayer ?? {}),
        ...Object.keys(researchByPlayer ?? {}),
    ]);
    for (const pid of ids) {
        out[pid] = getActiveResearchTrees(researchByPlayer?.[pid] ?? {}, equipmentByPlayer?.[pid] ?? []);
    }
    return out;
}

/** Node-level counterpart of `activeResearchByPlayer`. */
export function activeResearchNodeLevelsByPlayer(
    equipmentByPlayer: Record<string, readonly string[]> | undefined,
    levelsByPlayer: Record<string, Record<string, Record<string, number>>> | undefined,
): Record<string, Record<string, Record<string, number>>> {
    const out: Record<string, Record<string, Record<string, number>>> = {};
    for (const [pid, levels] of Object.entries(levelsByPlayer ?? {})) {
        out[pid] = getActiveResearchNodeLevels(levels, equipmentByPlayer?.[pid] ?? []);
    }
    return out;
}

export interface CharacterLoadout {
    activeResearchTrees: Record<string, string[]>;
    battleEquipmentIds: string[];
    abilityIds: string[];
}

const FALLBACK_ABILITY_IDS = ['0101', '0120'];

const isBoundTree: TreePredicate = (tree) => !!tree.boundItem;
const isUnboundTree: TreePredicate = (tree) => !tree.boundItem;

function applyCardEffectsPhase(
    abilities: string[],
    activeResearchTrees: Record<string, string[]>,
    predicate: TreePredicate,
): string[] {
    let out = [...abilities];
    for (const cardId of getDirectCardsFromResearch(activeResearchTrees, predicate)) {
        if (!out.includes(cardId)) out.push(cardId);
    }
    const removed = getRemovedCardsFromResearch(activeResearchTrees, predicate);
    if (removed.size > 0) out = out.filter((id) => !removed.has(id));
    const replacements = getCardReplacementsFromResearch(activeResearchTrees, predicate);
    if (replacements.size > 0) out = applyCardReplacements(out, replacements);
    return out;
}

export function resolveCharacterLoadout(
    equipment: readonly string[],
    researchTrees: Record<string, string[]> | undefined,
): CharacterLoadout {
    const activeResearchTrees = getActiveResearchTrees(researchTrees ?? {}, equipment);
    const battleEquipmentIds = mergeBattleEquipmentIdsFromResearch(
        [...equipment],
        activeResearchTrees,
    ).equipmentIds;

    let abilities: string[] = [];
    for (const itemId of battleEquipmentIds) {
        const item = getItemDef(itemId);
        if (!item) continue;
        for (const cardId of item.cardsToAdd) {
            if (!abilities.includes(cardId)) abilities.push(cardId);
        }
    }
    // Fallback if no equipment (should not happen if new characters get a core).
    if (abilities.length === 0) abilities.push(...FALLBACK_ABILITY_IDS);

    abilities = applyCardEffectsPhase(abilities, activeResearchTrees, isBoundTree);
    abilities = applyCardEffectsPhase(abilities, activeResearchTrees, isUnboundTree);

    if (abilities.length === 0) abilities.push(...FALLBACK_ABILITY_IDS);
    return { activeResearchTrees, battleEquipmentIds, abilityIds: abilities };
}
