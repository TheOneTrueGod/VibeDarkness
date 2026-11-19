import type { AbilityModifier } from '../../../../researchTrees/types';
import {
    AbilityPhase,
    isAbilityTimingInterval,
    type AbilityTimingEntry,
    type AbilityTimingInterval,
} from '../abilityTimings';
import { withComboCancelAtPhaseStart } from './comboCancelTimings';
import { getComboGrant } from './comboGrant';

const COMBO_LINGER_ID_FRAGMENT = '_combo_cancel_linger';

/** Legacy rows to intervals WITHOUT the coop tail split (consumers normalize and split after this). */
function toIntervals(entries: AbilityTimingEntry[]): AbilityTimingInterval[] {
    let cursor = 0;
    return entries.map((e, i) => {
        if (isAbilityTimingInterval(e)) {
            cursor = Math.max(cursor, e.end);
            return e;
        }
        const interval: AbilityTimingInterval = {
            id: `legacy_${i}`,
            start: cursor,
            end: cursor + e.duration,
            abilityPhase: e.abilityPhase,
        };
        cursor += e.duration;
        return interval;
    });
}

/**
 * Applies a caster's Combo grant (from research) to an ability's resolved timings: opens a conditional
 * cancel window at the start of the final Cooldown. Hot path (called every tick): returns `entries`
 * itself, without allocating, when there is no grant, no Cooldown interval, or a combo window already exists.
 */
export function applyComboGrantToTimings(
    entries: AbilityTimingEntry[],
    caster: unknown,
    abilityId: string,
): AbilityTimingEntry[] {
    const modifiers = (caster as { abilityModifiers?: Record<string, AbilityModifier> } | null | undefined)
        ?.abilityModifiers;
    if (!modifiers || typeof modifiers !== 'object') return entries;
    if (getComboGrant(modifiers[abilityId]) === null) return entries;

    let hasCooldown = false;
    for (const e of entries) {
        if (isAbilityTimingInterval(e) && e.id.includes(COMBO_LINGER_ID_FRAGMENT)) return entries;
        if (e.abilityPhase === AbilityPhase.Cooldown) hasCooldown = true;
    }
    if (!hasCooldown) return entries;

    return withComboCancelAtPhaseStart(toIntervals(entries), AbilityPhase.Cooldown, { which: 'last' });
}
