import type { RecoveryChargeType } from '../../abilities/abilityUses';
import type { CastBehaviourEntry } from '../../abilities/castBehaviourTypes';
import type { TimingTargetDef } from '../../abilities/timingTargetDef';
import type { ActiveAbility } from '../types';
import type { VisualEffectDef } from '../effects/visualEffectDef';
import type { TeamId } from '../teams';
import type { Unit } from './Unit';
import type { PassiveBonuses } from '../../../../researchTrees/types';

/** AI behavior settings for enemy units. */
export interface AISettings {
    /** Minimum desired distance (px) to target. AI backs away if closer. */
    minRange: number;
    /** Maximum desired distance (px) to target. AI approaches if farther. */
    maxRange: number;
}

export type DamageModifier = { flatAmt: number; multiplier: number };

export interface UnitCombatSettings {
    damageModifier?: DamageModifier;
}

/** Movement state for a unit. */
export interface UnitMovement {
    /** Grid cells to traverse, each exactly 1 cell (cardinal or diagonal) from the previous. */
    path: { col: number; row: number }[];
    /** ID of the unit being pursued (undefined for ground-move orders). */
    targetUnitId: string | undefined;
    /** Exact world-pixel destination for the final step (overrides jittered tile centre). */
    targetPixel?: { x: number; y: number };
    /** The gameTick when pathfinding was last computed. */
    pathfindingTick: number;
}

/** Source of knockback (for callbacks). Serializable. */
export interface KnockbackSource {
    /** Unit ID that applied the knockback. */
    unitId: string;
    /** Ability ID used. */
    abilityId: string;
}

/** Knockback state on a unit. Serializable. */
export interface KnockbackState {
    /** Direction and magnitude (px) of the knockback. */
    knockbackVector: { x: number; y: number };
    /** Time (seconds) the unit is in the air and cannot move; full vector applied. */
    knockbackAirTime: number;
    /** Time (seconds) after air during which half the vector is applied (slide). */
    knockbackSlideTime: number;
    /** Who applied the knockback (for callbacks). */
    knockbackSource: KnockbackSource;
    /** Time (seconds) this knockback has been active. */
    knockbackElapsed: number;
    /** When true, terrain collision is bypassed so the unit can travel through walls. */
    passThroughTerrain?: boolean;
    /** When true, sweep movement against other living units and emit collision events. */
    collideWithUnits?: boolean;
    /** When true, reflect knockback off blocking terrain instead of halting. */
    bounceOffTerrain?: boolean;
    /**
     * Fraction of total knockback displacement (air + slide) before unit–unit collision
     * activates. Terrain collision is unaffected. Omitted or 0 = check from first tick.
     */
    unitCollisionStartFraction?: number;
}

/** Parameters for applying knockback to a unit. */
export interface ApplyKnockbackParams {
    knockbackVector: { x: number; y: number };
    knockbackAirTime: number;
    knockbackSlideTime: number;
    knockbackSource: KnockbackSource;
    /** When true, terrain collision is bypassed so the unit can travel through walls. */
    passThroughTerrain?: boolean;
    /** When true, sweep movement against other living units and emit collision events. */
    collideWithUnits?: boolean;
    /** When true, reflect knockback off blocking terrain instead of halting. */
    bounceOffTerrain?: boolean;
    /**
     * Fraction of total knockback displacement (air + slide) before unit–unit collision
     * activates. Terrain collision is unaffected. Omitted or 0 = check from first tick.
     */
    unitCollisionStartFraction?: number;
}

/** Non-interrupting nudge state on a unit. Serializable. */
export interface NudgeState {
    /** Total displacement vector (px) applied linearly over nudgeDuration. */
    nudgeVector: { x: number; y: number };
    /** Time (seconds) over which the full vector is applied. */
    nudgeDuration: number;
    /** Time (seconds) this nudge has been active. */
    nudgeElapsed: number;
}

export interface UnitAbilityRuntimeState {
    currentUses: number;
    maxUses: number;
    recoveryChargesByType: Partial<Record<RecoveryChargeType, number>>;
    /** False when this ability is hidden by the swap network (not shown in UI, not usable). Defaults to true. */
    active: boolean;
    /** The ability ID this ability pushed aside when it activated. Null when not currently swapped in. */
    replacedAbilityId: string | null;
}

/** Constructor config for {@link Unit}. */
export interface UnitConfig {
    id?: string;
    x: number;
    y: number;
    hp: number;
    maxHp?: number;
    speed: number;
    teamId: TeamId;
    ownerId: string;
    characterId: string;
    portraitId?: string;
    name: string;
    abilities?: string[];
    aiSettings?: AISettings | null;
    /** UnitAITree ID for AI. Default 'default'. */
    unitAITreeId?: string;
    /** Explicit radius override. When omitted, radius resolves from the unit def's size (portrait for players). */
    radius?: number;
    /** Stamina stat. */
    stamina?: number;
    /** Optional per-unit combat tuning values. */
    combatSettings?: UnitCombatSettings;
    /** Aggregated passive research bonuses (computed at mission start). */
    passiveBonuses?: PassiveBonuses;
    ephemeralDespawnAtGameTime?: number | null;
    /** Number of units in this stack (default 1). */
    stackSize?: number;
}

/** Active sustained CastBehaviour record keyed by `${intervalId}_${behaviourIdx}`. Runtime-only. */
export interface ActiveCastBehaviourRecord {
    entry: CastBehaviourEntry;
    intervalStart: number;
    intervalEnd: number;
    caster: Unit;
    active: ActiveAbility;
    /** targetDef from the parent timing interval, for resolving targetsByLabel. */
    targetDef?: TimingTargetDef;
    /** Visual effects to fire at the first tick for instant abilities that don't launch a projectile. */
    onProjectileHit?: VisualEffectDef[];
    /** When true, fire onProjectileHit at the first sustained tick (instant abilities). */
    fireOnHitAtFirstTick?: boolean;
}
