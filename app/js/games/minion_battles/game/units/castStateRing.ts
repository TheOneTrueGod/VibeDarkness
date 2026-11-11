/**
 * Cast-state ring (`UnitDefEntry.castStateRing`): what a unit's ring shows, from its running casts.
 *
 * - **Acting** (a cast is winding up or striking): `fraction` fills 0 → 1 over the cast up to its cooldown,
 *   so the ring is full exactly when the unit stops being busy (see `castPriority.ts`).
 * - **Recovering** (only cooldowns left): `fraction` is the cooldown remaining, 1 → 0, so the ring drains.
 * - **Ready** (no casts): `null`, no ring.
 *
 * Overlapping casts: acting wins over recovering; among acting casts the least-filled one shows, among
 * recovering casts the longest remaining. Elapsed time is the unit's local clock, so haste/slow apply.
 * Render-only: reads state, keeps none.
 */
import type { Unit } from './Unit';
import { getAbility } from '../../abilities/AbilityRegistry';
import {
    AbilityPhase,
    normalizeAbilityTimingsToIntervals,
    resolveAbilityTimingEntries,
} from '../../abilities/abilityTimings';
import { getCastElapsed } from '../time/actorClock';
import { hasCastStateRing } from './unit_defs/unitDef';

export interface CastStateRing {
    kind: 'acting' | 'recovering';
    /** Acting: filled share (0 → 1). Recovering: cooldown remaining (1 → 0). */
    fraction: number;
}

function isCooldown(phase: AbilityPhase | undefined): boolean {
    return phase === AbilityPhase.Cooldown || phase === AbilityPhase.CoopCooldown;
}

/** The ring to show for `unit`, or `null` when it has none (no flag, or ready). */
export function getCastStateRing(unit: Unit, engine: { gameTime: number }): CastStateRing | null {
    if (!hasCastStateRing(unit.characterId)) return null;
    let acting: number | null = null;
    let recovering: number | null = null;
    for (const active of unit.activeAbilities) {
        const ability = getAbility(active.abilityId);
        if (!ability) continue;
        const intervals = normalizeAbilityTimingsToIntervals(resolveAbilityTimingEntries(ability, unit, engine));
        if (intervals.length === 0) continue;
        const end = Math.max(...intervals.map((it) => it.end));
        const cooldowns = intervals.filter((it) => isCooldown(it.abilityPhase));
        const busyEnd = cooldowns.length > 0 ? Math.min(...cooldowns.map((it) => it.start)) : end;
        const elapsed = Math.max(0, getCastElapsed(unit, active, engine));
        if (elapsed < busyEnd) {
            const filled = busyEnd > 0 ? elapsed / busyEnd : 1;
            acting = acting === null ? filled : Math.min(acting, filled);
        } else if (end > busyEnd && elapsed < end) {
            const remaining = (end - elapsed) / (end - busyEnd);
            recovering = recovering === null ? remaining : Math.max(recovering, remaining);
        }
    }
    if (acting !== null) return { kind: 'acting', fraction: acting };
    if (recovering !== null) return { kind: 'recovering', fraction: recovering };
    return null;
}
