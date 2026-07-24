/**
 * Mission-end DarknessStrength campaign progression.
 *
 * Call only at mission end (never mid-battle). Victory decrements duration
 * counters; both victory and defeat merge host-promoted battle tallies.
 *
 * Policy: when `data.battlesRemaining` is a number and hits ≤ 0 after a
 * victory decrement, the instance is **removed** from the campaign list.
 */

import type { DarknessStrengthInstance } from './types';

/** Instance `data` key for victory-only duration (decremented on win). */
export const BATTLES_REMAINING_DATA_KEY = 'battlesRemaining' as const;

/**
 * Host-listed promotion crumb: merge `dataDelta` into the matching campaign
 * instance at mission end (victory or defeat).
 */
export interface DarknessStrengthDataPromotion {
    packageId: string;
    dataDelta: Record<string, unknown>;
}

export type MissionEndOutcome = 'victory' | 'defeat';

/**
 * On victory: for each instance whose `data` has a numeric `battlesRemaining`,
 * decrement by 1. Remove the instance when the counter hits ≤ 0.
 * Instances without a numeric counter are left unchanged.
 */
export function decrementBattlesRemainingOnVictory(
    instances: readonly DarknessStrengthInstance[],
): DarknessStrengthInstance[] {
    const out: DarknessStrengthInstance[] = [];
    for (const inst of instances) {
        const remaining = inst.data?.[BATTLES_REMAINING_DATA_KEY];
        if (typeof remaining !== 'number') {
            out.push(cloneInstance(inst));
            continue;
        }
        const next = remaining - 1;
        if (next <= 0) {
            // Def policy: remove when battlesRemaining hits 0 (do not keep a dead crumb).
            continue;
        }
        out.push({
            packageId: inst.packageId,
            data: {
                ...inst.data,
                [BATTLES_REMAINING_DATA_KEY]: next,
            },
        });
    }
    return out;
}

/**
 * Merge promoted counters into matching campaign instances.
 * Numeric keys add; other keys overwrite. Unknown packageIds are skipped
 * (promotions do not create new campaign instances).
 */
export function mergeDarknessStrengthPromotions(
    instances: readonly DarknessStrengthInstance[],
    promotions: readonly DarknessStrengthDataPromotion[],
): DarknessStrengthInstance[] {
    if (promotions.length === 0) {
        return instances.map(cloneInstance);
    }

    const deltaById = new Map<string, Record<string, unknown>>();
    for (const promo of promotions) {
        const prev = deltaById.get(promo.packageId) ?? {};
        deltaById.set(promo.packageId, mergeDataDelta(prev, promo.dataDelta));
    }

    return instances.map((inst) => {
        const delta = deltaById.get(inst.packageId);
        if (!delta) {
            return cloneInstance(inst);
        }
        return {
            packageId: inst.packageId,
            data: mergeDataDelta(inst.data ?? {}, delta),
        };
    });
}

/**
 * Full mission-end pipeline: victory duration decrement (if win), then
 * promotion merge (victory or defeat). Safe to call with empty promotions.
 */
export function applyMissionEndDarknessStrengthProgression(
    instances: readonly DarknessStrengthInstance[],
    options: {
        outcome: MissionEndOutcome;
        promotions?: readonly DarknessStrengthDataPromotion[];
    },
): DarknessStrengthInstance[] {
    const afterDuration =
        options.outcome === 'victory'
            ? decrementBattlesRemainingOnVictory(instances)
            : instances.map(cloneInstance);
    return mergeDarknessStrengthPromotions(afterDuration, options.promotions ?? []);
}

function cloneInstance(inst: DarknessStrengthInstance): DarknessStrengthInstance {
    return {
        packageId: inst.packageId,
        ...(inst.data !== undefined ? { data: { ...inst.data } } : {}),
    };
}

/** Merge `delta` into `base`: numbers add, other values overwrite. */
function mergeDataDelta(
    base: Record<string, unknown>,
    delta: Record<string, unknown>,
): Record<string, unknown> {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(delta)) {
        const prev = out[key];
        if (typeof prev === 'number' && typeof value === 'number') {
            out[key] = prev + value;
        } else {
            out[key] = value;
        }
    }
    return out;
}
