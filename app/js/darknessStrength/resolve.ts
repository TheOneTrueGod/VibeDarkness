/**
 * Resolve campaign / region / mission DarknessStrength sources + admin overrides
 * into the active set for a battle context.
 */

import type { CampaignRegionState } from '../types';
import { getDarknessStrength } from './registry';
import type {
    DarknessStrengthAdminOverride,
    DarknessStrengthDef,
    DarknessStrengthInstance,
} from './types';

/** One resolved active package with its def and effective data crumb. */
export interface ActiveDarknessStrength {
    packageId: string;
    data?: Record<string, unknown>;
    def: DarknessStrengthDef;
}

/** Inputs for {@link resolveActiveDarknessStrengths}. */
export interface ResolveActiveDarknessStrengthsInput {
    /** Campaign (or pre-merged) instance crumbs. */
    instances: readonly DarknessStrengthInstance[];
    /** Admin force enable/disable keyed by packageId. */
    overrides?: Readonly<Record<string, DarknessStrengthAdminOverride>>;
    /**
     * When set with `regions`, include that region's `activeDomainPackageIds`
     * as natural sources (no data unless already on an instance).
     */
    regionId?: string;
    regions?: Readonly<Record<string, CampaignRegionState>>;
    /** Mission / story one-off package ids for this battle. */
    missionPackageIds?: readonly string[];
}

/**
 * Threshold gate hook: when `data` supplies counters the package cares about,
 * drop packages that no longer qualify. Starters have no thresholds yet.
 *
 * Current rule: if `data.battlesRemaining` is a number ≤ 0, the package is inactive.
 */
export function passesDarknessStrengthThresholds(
    _def: DarknessStrengthDef,
    data?: Record<string, unknown>,
): boolean {
    if (data && 'battlesRemaining' in data) {
        const remaining = data.battlesRemaining;
        if (typeof remaining === 'number' && remaining <= 0) {
            return false;
        }
    }
    return true;
}

/**
 * Build the active DarknessStrength list for a battle:
 * natural instances + region domain ids + mission package ids, then admin overrides.
 *
 * - `enabled: false` drops the package even if naturally present.
 * - `enabled: true` inserts a missing package; optional override `data` wins for that resolve.
 * Unknown package ids (no registry def) are skipped.
 */
export function resolveActiveDarknessStrengths(
    input: ResolveActiveDarknessStrengthsInput,
): ActiveDarknessStrength[] {
    const byId = new Map<string, DarknessStrengthInstance>();

    for (const inst of input.instances) {
        byId.set(inst.packageId, {
            packageId: inst.packageId,
            data: inst.data,
        });
    }

    if (input.regionId && input.regions) {
        const region = input.regions[input.regionId];
        for (const packageId of region?.activeDomainPackageIds ?? []) {
            if (!byId.has(packageId)) {
                byId.set(packageId, { packageId });
            }
        }
    }

    for (const packageId of input.missionPackageIds ?? []) {
        if (!byId.has(packageId)) {
            byId.set(packageId, { packageId });
        }
    }

    const overrides = input.overrides ?? {};
    for (const [packageId, override] of Object.entries(overrides)) {
        if (!override.enabled) {
            byId.delete(packageId);
            continue;
        }
        const existing = byId.get(packageId);
        byId.set(packageId, {
            packageId,
            data: override.data !== undefined ? override.data : existing?.data,
        });
    }

    const active: ActiveDarknessStrength[] = [];
    for (const inst of byId.values()) {
        const def = getDarknessStrength(inst.packageId);
        if (!def) continue;
        if (!passesDarknessStrengthThresholds(def, inst.data)) continue;
        active.push({
            packageId: inst.packageId,
            data: inst.data,
            def,
        });
    }
    return active;
}
