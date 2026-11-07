/**
 * Granted AI casts: "cast this ability once more, as soon as it can be cast, ignoring its schedule".
 *
 * A grant restores one use of the ability (capped at its max) and puts it on the unit's
 * `aiContext.grantedCasts` list. While granted, `pickBestAbility` ignores the ability's schedule gates
 * (`roundWindow`, `roundInterval`, `maxUsesPerRound`, `onlyWhenGranted`) and prefers it over every
 * ungranted ability, oldest grant first. Everything else still applies: tags, range, affordability,
 * `canUse`. A grant waits until the ability can be cast, and is consumed when its order is queued.
 *
 * Sources:
 *  - `aiSettings.followUp` on an ability: queuing it grants the follow-ups, so they are cast right after.
 *  - `grantAiCasts` on a unit phase: entering the phase (e.g. an HP threshold) recovers those abilities.
 *
 * State is plain JSON on the AI context, so it checkpoints with the unit.
 */

import type { Unit } from '../Unit';
import { restoreAbilityUses } from '../../../abilities/abilityUses';

/** Pending granted casts, oldest first. */
export function getGrantedCasts(unit: Unit): readonly string[] {
    return unit.aiContext.grantedCasts ?? [];
}

/** Grant one off-schedule cast of each ability (restoring a use). An ability already granted is not doubled. */
export function grantAiCasts(unit: Unit, abilityIds: readonly string[] | undefined): void {
    if (!abilityIds || abilityIds.length === 0) return;
    const list = [...getGrantedCasts(unit)];
    for (const id of abilityIds) {
        if (!unit.abilities.includes(id)) continue;
        restoreAbilityUses(unit, id, 1);
        if (!list.includes(id)) list.push(id);
    }
    unit.aiContext.grantedCasts = list;
}

/** Drop the grant for `abilityId` once its order has been queued. */
export function consumeGrantedCast(unit: Unit, abilityId: string): void {
    const list = unit.aiContext.grantedCasts;
    if (!list?.includes(abilityId)) return;
    unit.aiContext.grantedCasts = list.filter((id) => id !== abilityId);
}
