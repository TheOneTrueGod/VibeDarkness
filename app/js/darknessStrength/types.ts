/**
 * DarknessStrength package defs, persist crumbs, and compile effect shapes.
 * Campaign saves only instances + admin overrides; defs live in the static registry.
 */

import type { PassiveBonusMap } from '../researchTrees/types';
import type { CreatureType } from '../games/minion_battles/game/units/unit_defs/unitDef';
import type { UnitTag } from '../games/minion_battles/game/units/unitTag';
import type { SpawnBehaviour } from '../games/minion_battles/storylines/types';
import type { WorldModifierDef } from '../games/minion_battles/worldModifiers/types';

/** Meta-progression lane that authored the package. Starters use `darkness`. */
export type DarknessStrengthLane = 'darkness' | 'region' | 'curse' | 'mission';

/**
 * Unit match filter for `statBag` (and future effects).
 * All set fields must match (AND). Omitted fields are ignored.
 */
export interface UnitFilter {
    characterId?: string;
    creatureType?: CreatureType;
    /** Subject must carry every listed tag (AND). */
    tags?: readonly UnitTag[];
}

/** Minimal subject for {@link matchesUnitFilter} — unit instance or def-shaped object. */
export interface UnitFilterSubject {
    characterId: string;
    /** When omitted, resolved via unit-def lookup when matching. */
    creatureType?: CreatureType;
    tags?: readonly UnitTag[];
}

/** Enemy or player passive bag shaped like research `PassiveBonusMap`. */
export interface DarknessStrengthStatBagEffect {
    type: 'statBag';
    target: 'enemy' | 'player';
    filter?: UnitFilter;
    bonuses: PassiveBonusMap;
}

/**
 * Spawn tweak applied each round (v1: round-start reinforcements).
 * Prefer `edgeOfMap` unless darkness placement is required (`anywhere` + `inDarkness`).
 */
export interface DarknessStrengthSpawnTweakEffect {
    type: 'spawnTweak';
    everyRound: true;
    characterId: string;
    count: number;
    spawnBehaviour?: SpawnBehaviour;
    /** Only with `spawnBehaviour: 'anywhere'` — restrict to full-darkness tiles. */
    inDarkness?: boolean;
}

/**
 * Stub for packages that install a world modifier by preset id or inline def.
 * Not required by the three starter packages.
 */
export interface DarknessStrengthWorldModifierEffect {
    type: 'worldModifier';
    presetId?: string;
    def?: WorldModifierDef;
}

export type DarknessStrengthCompileEffect =
    | DarknessStrengthStatBagEffect
    | DarknessStrengthSpawnTweakEffect
    | DarknessStrengthWorldModifierEffect;

/** Static package definition (code registry only). */
export interface DarknessStrengthDef {
    packageId: string;
    name: string;
    description: string;
    icon: string;
    lane: DarknessStrengthLane;
    compile: DarknessStrengthCompileEffect[];
}

/** Minimal campaign (or mission) instance crumb. */
export interface DarknessStrengthInstance {
    packageId: string;
    data?: Record<string, unknown>;
}

/** Admin force enable/disable (+ optional test `data`) keyed by packageId. */
export interface DarknessStrengthAdminOverride {
    enabled: boolean;
    data?: Record<string, unknown>;
}
