import {
    CRYSTAL_ROCKS_NODE_BASE,
    CRYSTAL_ROCKS_NODE_CHARGED_ROCKS,
    CRYSTAL_ROCKS_TREE_ID,
} from '../../../../researchTrees/trees/crystal_rocks';
import { STARTING_WEAPON_ROCKS_NODE_ID } from '../../../../researchTrees/trees/startingWeaponNodes';
import { coreEarthItem } from './core/019_core_earth';
import type { ItemDef } from './types';

/** True when Earth Core should supply base Throw Rock (no crystal rock weapon research yet). */
export function earthCoreGrantsThrowRock(
    researchTrees: Record<string, string[]> | undefined,
): boolean {
    const crystalResearched = new Set(researchTrees?.[CRYSTAL_ROCKS_TREE_ID] ?? []);
    return (
        !crystalResearched.has(CRYSTAL_ROCKS_NODE_BASE)
        && !crystalResearched.has(CRYSTAL_ROCKS_NODE_CHARGED_ROCKS)
    );
}

/**
 * Effective ability cards from an equipped item, including research-gated extras
 * (e.g. Earth Core grants Throw Rock only before rock weapon research).
 */
export function resolveItemCardsToAdd(
    item: ItemDef,
    researchTrees: Record<string, string[]> | undefined,
): readonly string[] {
    if (item.id !== coreEarthItem.id) {
        return item.cardsToAdd;
    }
    if (!earthCoreGrantsThrowRock(researchTrees)) {
        return item.cardsToAdd;
    }
    if (item.cardsToAdd.includes(STARTING_WEAPON_ROCKS_NODE_ID)) {
        return item.cardsToAdd;
    }
    return [...item.cardsToAdd, STARTING_WEAPON_ROCKS_NODE_ID];
}
