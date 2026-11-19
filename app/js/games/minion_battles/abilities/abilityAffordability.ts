import { getAbilityResourceCosts, type AbilityStatic } from './Ability';
import type { Unit } from '../game/units/Unit';

/**
 * First resource the unit can't pay for this ability, or null when it can afford it. `'hp'` means the
 * `hpCost` gate (HP is paid by the cast behaviour, not a `Resource`). Shared by the card UI and the
 * ITS swap check.
 */
export function getUnaffordableResourceId(unit: Unit, ability: AbilityStatic): string | null {
    for (const cost of getAbilityResourceCosts(ability, unit)) {
        const resource = unit.getResource(cost.resourceId);
        if (!resource) return cost.resourceId;
        if (cost.allowPartialIfPositive) {
            if (resource.current <= 0) return cost.resourceId;
            continue;
        }
        if (!resource.canAfford(cost.amount)) return cost.resourceId;
    }
    if (ability.hpCost != null && (ability.hpCostGate ?? 'requireSurplus') === 'requireSurplus') {
        if (unit.hp <= ability.hpCost) return 'hp';
    }
    return null;
}
