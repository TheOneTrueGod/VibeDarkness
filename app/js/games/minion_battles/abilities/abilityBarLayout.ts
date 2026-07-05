import type { Unit } from '../game/units/Unit';
import {
    ABILITY_BAR_CARD_GAP_PX,
    ABILITY_SLOT_WIDTH_PX,
} from '../ui/components/AbilitySlot';

/**
 * Stable key for React memo deps when swap-network code mutates `unit.abilities`
 * and `unit.abilityRuntime` in place (same object references).
 */
export function getAbilityBarLayoutKey(
    unit: Unit | null | undefined,
    fallbackAbilityIds: readonly string[],
): string {
    if (!unit) return fallbackAbilityIds.join(',');
    return unit.abilities
        .map((id) => {
            const r = unit.abilityRuntime[id];
            const active = r?.active === false ? '0' : '1';
            return `${id}:${active}:${r?.currentUses ?? '-'}`;
        })
        .join('|');
}

/** How many ability cards fit on one row at the given center-column width. */
export function maxAbilityCardsPerRow(centerWidthPx: number): number {
    if (centerWidthPx <= 0) return 1;
    const cardStride = ABILITY_SLOT_WIDTH_PX + ABILITY_BAR_CARD_GAP_PX;
    return Math.max(1, Math.floor((centerWidthPx + ABILITY_BAR_CARD_GAP_PX) / cardStride));
}

/** Split hand size into row-one count (remainder goes to row two). */
export function splitAbilityRows(totalCards: number, centerWidthPx: number): number {
    if (totalCards <= 0) return 0;
    const perRow = maxAbilityCardsPerRow(centerWidthPx);
    if (totalCards <= perRow) return totalCards;
    return perRow;
}
