/**
 * Static DarknessStrength package registry.
 */

import type { DarknessStrengthDef } from './types';
import { STARTER_DARKNESS_STRENGTHS } from './packages/starters';

const BY_ID = new Map<string, DarknessStrengthDef>(
    STARTER_DARKNESS_STRENGTHS.map((def) => [def.packageId, def]),
);

/** Look up a package def by id. */
export function getDarknessStrength(packageId: string): DarknessStrengthDef | undefined {
    return BY_ID.get(packageId);
}

/** All registered DarknessStrength package defs (stable starter order). */
export function listDarknessStrengths(): DarknessStrengthDef[] {
    return [...STARTER_DARKNESS_STRENGTHS];
}
