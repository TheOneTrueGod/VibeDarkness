/**
 * defineAbility — defaults factory for AbilityStatic.
 *
 * Fills in repeated boilerplate so ability files read as declarations of
 * *what* the ability does (numbers, shapes, riders) rather than *how* the
 * engine executes it.
 *
 * Defaults applied:
 *  - `onAttackBlocked` — no-op (override for charging/projectile abilities).
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
    type AttackBlockedInfo,
} from './Ability';
import type { AbilityTimingEntry, AbilityTimingInterval } from './abilityTimings';
import { isAbilityTimingInterval } from './abilityTimings';
import { isSelectTargetDef } from './timingTargetDef';
import type { Unit } from '../game/units/Unit';

// ---------------------------------------------------------------------------
// Input type
// ---------------------------------------------------------------------------

export interface AbilityDefInput extends Omit<AbilityStatic, 'getRange' | 'onAttackBlocked' | 'getAbilityStates'> {
    /**
     * Optional. When omitted, `getRange` is derived from the first timing
     * interval that has a `targetDef.hitbox` with a `maxRange` property.
     * If no such interval is found, the factory will throw.
     */
    getRange?: AbilityStatic['getRange'];

    /**
     * Optional. When omitted, `onAttackBlocked` is a no-op.
     */
    onAttackBlocked?: AbilityStatic['onAttackBlocked'];

    /**
     * Optional. When provided, `getAbilityStates` returns
     * `MOVEMENT_PENALTY { amount: 0 }` while `currentTime < until`, then `[]`.
     * When omitted, `getAbilityStates` always returns `[]`.
     * Ignored when you provide `getAbilityStates` directly on this input object.
     * @deprecated Pass `getAbilityStates` directly if you need non-trivial state logic.
     */
    movementLock?: { until: number };

    /**
     * Optional. Provide to override the default no-op `getAbilityStates`.
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

    // --- onAttackBlocked ---
    const onAttackBlocked: AbilityStatic['onAttackBlocked'] = def.onAttackBlocked
        ?? ((_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void => { /* no-op */ });

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

    // --- aiSettings: derive from hitbox when not provided ---
    // When the caller omits aiSettings entirely and a hitbox is available,
    // synthesise a default { minRange: 0, maxRange: hitboxMaxRange }.
    // If aiSettings is provided, use it as-is (the caller already set maxRange).
    let aiSettings = def.aiSettings;
    if (!aiSettings && hitboxMaxRange !== null) {
        aiSettings = { minRange: 0, maxRange: hitboxMaxRange };
    }

    return {
        ...def,
        aiSettings,
        getRange,
        onAttackBlocked,
        getAbilityStates,
    };
}
