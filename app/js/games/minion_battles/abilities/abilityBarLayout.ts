import type { Unit } from '../game/units/Unit';

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
