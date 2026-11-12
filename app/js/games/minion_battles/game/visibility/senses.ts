/**
 * Senses: how a unit perceives other units. Pure data and merge rules; no engine runtime imports, so the
 * research tree can import the grant presets as plain data.
 *
 * A unit's senses come from three sources, merged by {@link getUnitSenses}:
 * - the unit def baseline (`UnitDefEntry.senses`, read through `Unit.baseSenses`);
 * - instance grants on the unit (`Unit.senseGrants`, serialized; research and abilities write these);
 * - grants carried by buffs (`Buff.senseGrants`, def-pattern, so they come and go with the buff).
 *
 * Ranges are in tiles. Team perception (what the local player sees) is built from these profiles and is
 * presentation-only: simulation code never reads it.
 */

import { DarknessLevel } from '../darknessLevels';

/** A sense that can detect a unit. Each has an entry in {@link SENSE_DEFS}. */
export type SenseId = 'vision' | 'hearing' | 'tremorsense';

/**
 * How well a team perceives a unit, strongest first: seen > glimpsed > heard > felt > hidden.
 * `'glimpsed'` is the long-range vision tier (a lit enemy beyond vision range with a clear line).
 */
export type Detection = 'seen' | 'glimpsed' | 'heard' | 'felt' | 'hidden';

/** Indicator style id drawn for a unit detected only by a non-visual sense. */
export type SenseIndicatorStyleId = 'hearing' | 'tremorsense';

/** Vision parameters. */
export interface VisionSense {
    /** Vision range in tiles (Euclidean). */
    range: number;
    /** Total darkness cost (see {@link darknessVisionCost}) the line of sight can pass through. */
    darknessPenetration: number;
    /** When true, a lit enemy beyond `range` with a clear line is glimpsed. */
    glimpseLit: boolean;
}

/** A range-only sense (hearing, tremorsense). */
export interface RangedSense {
    /** Range in tiles (Euclidean). */
    range: number;
}

/** A unit's resolved senses. Absent senses are not had at all. */
export interface SenseProfile {
    vision?: VisionSense;
    /** Extra darkness cost vision can pass through, added to `vision.darknessPenetration`. */
    darkvision?: number;
    hearing?: RangedSense;
    tremorsense?: RangedSense;
}

/**
 * One change to a unit's senses. Merge rules ({@link mergeSenseGrants}): ranges take the max, `darkvision`
 * and `darknessPenetration` add, `glimpseLit` is OR-ed.
 */
export type SenseGrant =
    | { kind: 'vision'; range?: number; darknessPenetration?: number; glimpseLit?: boolean }
    | { kind: 'darkvision'; amount: number }
    | { kind: 'hearing'; range: number }
    | { kind: 'tremorsense'; range: number };

/** Static rules for one sense. Perception reads these instead of branching per sense. */
export interface SenseDef {
    /** Detection tier this sense produces. */
    detection: Exclude<Detection, 'glimpsed' | 'hidden'>;
    /** Higher wins when several senses detect the same unit. */
    priority: number;
    /** When true, a `blocksVision` tile on the line stops this sense. */
    blockedByWalls: boolean;
    /** When true, darkness along the line limits this sense (see {@link darknessVisionCost}). */
    affectedByDarkness: boolean;
    /** Indicator drawn for units detected by this sense alone; null when the unit itself is drawn. */
    indicatorStyle: SenseIndicatorStyleId | null;
}

/** Registry of senses. A new sense (echolocation, true sight) is a new entry here. */
export const SENSE_DEFS: Readonly<Record<SenseId, SenseDef>> = {
    vision: {
        detection: 'seen',
        priority: 30,
        blockedByWalls: true,
        affectedByDarkness: true,
        indicatorStyle: null,
    },
    hearing: {
        detection: 'heard',
        priority: 20,
        blockedByWalls: false,
        affectedByDarkness: false,
        indicatorStyle: 'hearing',
    },
    tremorsense: {
        detection: 'felt',
        priority: 10,
        blockedByWalls: false,
        affectedByDarkness: false,
        indicatorStyle: 'tremorsense',
    },
};

/** Sense ids ordered strongest first (by `SENSE_DEFS[id].priority`). */
export const SENSE_IDS_BY_PRIORITY: readonly SenseId[] = (Object.keys(SENSE_DEFS) as SenseId[])
    .sort((a, b) => SENSE_DEFS[b].priority - SENSE_DEFS[a].priority);

/** Baseline senses for content units: vision 8 tiles, 2 tiles of full darkness, glimpses lit enemies. */
export const DEFAULT_UNIT_SENSES: Readonly<SenseProfile> = Object.freeze({
    vision: Object.freeze({ range: 8, darknessPenetration: 2, glimpseLit: true }),
});

/** Player baseline: the default plus hearing 4 tiles. */
export const PLAYER_SENSES: Readonly<SenseProfile> = Object.freeze({
    ...DEFAULT_UNIT_SENSES,
    hearing: Object.freeze({ range: 4 }),
});

/** See 3 tiles farther into darkness. */
export const DARKVISION_GRANT: Readonly<Extract<SenseGrant, { kind: 'darkvision' }>> = Object.freeze({ kind: 'darkvision', amount: 3 });

/** Sense units within 6 tiles through walls. */
export const TREMORSENSE_GRANT: Readonly<Extract<SenseGrant, { kind: 'tremorsense' }>> = Object.freeze({ kind: 'tremorsense', range: 6 });

function cloneProfile(p: Readonly<SenseProfile>): SenseProfile {
    const out: SenseProfile = {};
    if (p.vision) out.vision = { ...p.vision };
    if (p.darkvision !== undefined) out.darkvision = p.darkvision;
    if (p.hearing) out.hearing = { ...p.hearing };
    if (p.tremorsense) out.tremorsense = { ...p.tremorsense };
    return out;
}

function mergeRanged(cur: RangedSense | undefined, range: number): RangedSense {
    return { range: Math.max(cur?.range ?? 0, range) };
}

/**
 * Apply grants on top of a base profile. Returns a new profile; never mutates `base` (presets are frozen).
 * Ranges take the max, `darkvision` and `darknessPenetration` add, `glimpseLit` is OR-ed.
 */
export function mergeSenseGrants(base: Readonly<SenseProfile>, grants: readonly SenseGrant[]): SenseProfile {
    const out = cloneProfile(base);
    for (const g of grants) {
        switch (g.kind) {
            case 'vision': {
                const cur = out.vision ?? { range: 0, darknessPenetration: 0, glimpseLit: false };
                out.vision = {
                    range: Math.max(cur.range, g.range ?? 0),
                    darknessPenetration: cur.darknessPenetration + (g.darknessPenetration ?? 0),
                    glimpseLit: cur.glimpseLit || g.glimpseLit === true,
                };
                break;
            }
            case 'darkvision':
                out.darkvision = (out.darkvision ?? 0) + g.amount;
                break;
            case 'hearing':
                out.hearing = mergeRanged(out.hearing, g.range);
                break;
            case 'tremorsense':
                out.tremorsense = mergeRanged(out.tremorsense, g.range);
                break;
        }
    }
    return out;
}

/** The unit fields {@link getUnitSenses} reads (structural, so this module needs no runtime Unit import). */
export interface SensingUnit {
    /** Def baseline (`UnitDefEntry.senses`, default {@link DEFAULT_UNIT_SENSES}). */
    readonly baseSenses: Readonly<SenseProfile>;
    readonly senseGrants: readonly SenseGrant[];
    readonly buffs: readonly { readonly senseGrants?: readonly SenseGrant[] }[];
}

/** The single entry point for a unit's senses: def baseline + instance grants + buff grants. */
export function getUnitSenses(unit: SensingUnit): SenseProfile {
    const grants: SenseGrant[] = [...unit.senseGrants];
    for (const buff of unit.buffs) {
        if (buff.senseGrants) grants.push(...buff.senseGrants);
    }
    return mergeSenseGrants(unit.baseSenses, grants);
}

/** Total darkness vision can pass through: `vision.darknessPenetration + darkvision` (0 without vision). */
export function getDarknessPenetration(profile: Readonly<SenseProfile>): number {
    if (!profile.vision) return 0;
    return profile.vision.darknessPenetration + (profile.darkvision ?? 0);
}

/**
 * Darkness cost of one tile for vision: 0 at light ≥ `MEDIUM_LIGHT_MIN`, 1 at light ≤ `FULL_DARKNESS`,
 * linear in between.
 */
export function darknessVisionCost(lightLevel: number): number {
    const lo = DarknessLevel.FULL_DARKNESS;
    const hi = DarknessLevel.MEDIUM_LIGHT_MIN;
    if (lightLevel >= hi) return 0;
    if (lightLevel <= lo) return 1;
    return (hi - lightLevel) / (hi - lo);
}

function isFiniteNonNegative(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/** Parse one serialized grant; returns null when malformed. */
function parseSenseGrant(raw: unknown): SenseGrant | null {
    if (raw == null || typeof raw !== 'object') return null;
    const r = raw as Record<string, unknown>;
    switch (r.kind) {
        case 'vision': {
            const g: Extract<SenseGrant, { kind: 'vision' }> = { kind: 'vision' };
            if (isFiniteNonNegative(r.range)) g.range = r.range;
            if (typeof r.darknessPenetration === 'number' && Number.isFinite(r.darknessPenetration)) {
                g.darknessPenetration = r.darknessPenetration;
            }
            if (r.glimpseLit === true) g.glimpseLit = true;
            return g;
        }
        case 'darkvision':
            return typeof r.amount === 'number' && Number.isFinite(r.amount) ? { kind: 'darkvision', amount: r.amount } : null;
        case 'hearing':
        case 'tremorsense':
            return isFiniteNonNegative(r.range) ? { kind: r.kind, range: r.range } : null;
        default:
            return null;
    }
}

/** Parse `Unit.senseGrants` from a checkpoint. Missing or malformed data gives `[]`; bad entries are dropped. */
export function parseSenseGrantsFromJSON(raw: unknown): SenseGrant[] {
    if (!Array.isArray(raw)) return [];
    const out: SenseGrant[] = [];
    for (const item of raw) {
        const g = parseSenseGrant(item);
        if (g) out.push(g);
    }
    return out;
}
