/**
 * defineAbility — defaults factory for AbilityStatic.
 *
 * Fills in repeated boilerplate so ability files read as declarations of
 * *what* the ability does (numbers, shapes, riders) rather than *how* the
 * engine executes it.
 *
 * Defaults applied:
 *  - `getRange`        — derived from the first timing interval that has a
 *                        `targetDef.hitbox` with a `maxRange` property. When
 *                        no such interval is found you *must* supply `getRange`
 *                        explicitly — the factory will throw at call time.
 *  - `movementLock`    — when present, generates `getAbilityStates` returning
 *                        `MOVEMENT_PENALTY { amount: 0 }` until `movementLock.until`.
 *  - `aiSettings.maxRange` — when `aiSettings` is provided without `maxRange`,
 *                        falls back to the hitbox-derived range (0 if no hitbox).
 */

import {
    AbilityState,
    type AbilityStatic,
    type AbilityStateEntry,
} from './Ability';
import type { AbilityTimingEntry, AbilityTimingInterval } from './abilityTimings';
import { isAbilityTimingInterval } from './abilityTimings';
import { isSelectTargetDef } from './timingTargetDef';
import type { Unit } from '../game/units/Unit';
import type { WindupLungeConfig } from './WindupLunge';
import { setupWindupLungePayload } from './WindupLunge';

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface AbilityDefInput extends Omit<AbilityStatic, 'getRange' | 'getAbilityStates' | 'lunge'> {
    /**
     * Optional. When omitted, `getRange` is derived from the first timing
     * interval that has a `targetDef.hitbox` with a `maxRange` property.
     * If no such interval is found, the factory will throw.
     */
    getRange?: AbilityStatic['getRange'];
    /**
     * Optional windup lunge. When set:
     * - `getRange.maxRange` is extended by `lunge.distance` so the targeting cursor reflects the full reach.
     * - A `beginActiveCast` is automatically generated to snapshot the lunge target into `castPayload`
     *   (only when the caller does not supply their own `beginActiveCast`).
     */
    lunge?: WindupLungeConfig;

    /**
     * Optional. When provided, `getAbilityStates` returns
     * `MOVEMENT_PENALTY { amount: 0 }` while `currentTime < until`, then `[]`.
     * When omitted, `getAbilityStates` always returns `[]`.
     * Ignored when you provide `getAbilityStates` directly on this input object.
     * @deprecated Pass `getAbilityStates` directly if you need non-trivial state logic.
     */
    movementLock?: { until: number };

    /**
     * Optional. When provided, overrides the default no-op `getAbilityStates`.
     */
    getAbilityStates?: AbilityStatic['getAbilityStates'];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk the timing intervals and return the first `HitboxSpec`-style hitbox
 * (i.e. has a numeric `maxRange`) found in a `targetDef.hitbox`.
 * Returns null when none is found.
 */
function findFirstHitboxMaxRange(timings: AbilityTimingEntry[]): number | null {
    for (const entry of timings) {
        if (!isAbilityTimingInterval(entry)) continue;
        const interval = entry as AbilityTimingInterval;
        if (interval.targetDef && isSelectTargetDef(interval.targetDef)) {
            const hitbox = interval.targetDef.hitbox;
            if (typeof hitbox.maxRange === 'number') {
                return hitbox.maxRange;
            }
        }
    }
    return null;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a complete `AbilityStatic` from a partial input, filling in
 * boilerplate defaults (see module-level JSDoc for the full list).
 */
export function defineAbility(def: AbilityDefInput): AbilityStatic {
    // Derive hitbox range once for reuse in getRange + aiSettings.
    const hitboxMaxRange = findFirstHitboxMaxRange(def.abilityTimings);

    // --- getRange ---
    let getRange: AbilityStatic['getRange'];
    if (def.getRange) {
        getRange = def.getRange;
    } else if (hitboxMaxRange !== null) {
        getRange = (_caster: Unit) => ({ minRange: 0, maxRange: hitboxMaxRange });
    } else {
        throw new Error(
            `defineAbility: ability "${def.id}" has no explicit getRange and no ` +
            `timing interval with a targetDef.hitbox. Either add a targetDef with a ` +
            `HitboxSpec to the first timing interval, or pass getRange explicitly.`,
        );
    }

    // --- getAbilityStates ---
    let getAbilityStates: AbilityStatic['getAbilityStates'];
    if (def.getAbilityStates) {
        getAbilityStates = def.getAbilityStates;
    } else if (def.movementLock) {
        const until = def.movementLock.until;
        getAbilityStates = (currentTime: number): AbilityStateEntry[] => {
            if (currentTime < until) {
                return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
            }
            return [];
        };
    } else {
        getAbilityStates = (_currentTime: number): AbilityStateEntry[] => [];
    }

    // --- lunge: extend getRange and auto-generate beginActiveCast ---
    if (def.lunge) {
        const lungeDistance = def.lunge.distance;
        const baseGetRange = getRange;
        getRange = (caster: Unit): { minRange: number; maxRange: number } | null => {
            const r = baseGetRange(caster);
            if (r == null) return null;
            return { minRange: r.minRange, maxRange: r.maxRange + lungeDistance };
        };
    }

    // --- aiSettings: derive from hitbox when not provided ---
    // When the caller omits aiSettings entirely and a hitbox is available,
    // synthesise a default { minRange: 0, maxRange: hitboxMaxRange }.
    // If aiSettings is provided, use it as-is (the caller already set maxRange).
    let aiSettings = def.aiSettings;
    if (!aiSettings && hitboxMaxRange !== null) {
        aiSettings = { minRange: 0, maxRange: hitboxMaxRange };
    }

    const result: AbilityStatic = {
        ...def,
        aiSettings,
        getRange,
        getAbilityStates,
    };

    // Wire up lunge payload setup in beginActiveCast.
    // - No existing beginActiveCast: generate one that only does lunge setup.
    // - Existing beginActiveCast: wrap it so lunge setup runs first, then the caller's logic.
    //   (The caller's function may append to castPayload or spawn VFX; lunge setup must run
    //   first so a subsequent caller override could replace it intentionally if needed.)
    if (def.lunge) {
        const lunge = def.lunge;
        const localHitboxMaxRange = hitboxMaxRange;
        const callerBeginActiveCast = def.beginActiveCast;
        result.beginActiveCast = (engine, caster, targets, active) => {
            setupWindupLungePayload(engine, caster, targets, active, lunge, localHitboxMaxRange);
            callerBeginActiveCast?.(engine, caster, targets, active);
        };
    }

    return result;
}
