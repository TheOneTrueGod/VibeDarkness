import { MeleeAttackBehaviour } from './MeleeAttack';
import { DashBehaviour } from './DashBehaviour';
import { InitAbilityNoteBehaviour } from './InitAbilityNoteBehaviour';
import { ProjectileLaunchBehaviour } from './ProjectileLaunchBehaviour';
import { InstantBehaviour, type InstantOptions } from './InstantBehaviour';
import { CasterSlideBehaviour, type CasterSlideConfig } from './CasterSlideBehaviour';
import { CasterShakeBehaviour, type CasterShakeConfig } from './CasterShakeBehaviour';
import { createCharge, type ChargeConfig, type ChargeNoteLike, type ChargeBehaviour } from './ChargeBehaviour';
import { SpawnUnits, type SpawnUnitsConfig, type SpawnUnitsBehaviour } from './SpawnUnitsBehaviour';
import { Leap, type LeapConfig, type LeapBehaviour } from './LeapBehaviour';
import { GroundPatch, type GroundPatchConfig, type GroundPatchBehaviour } from './GroundPatchBehaviour';
import { terrainStrike, type TerrainStrikeBehaviour } from './TerrainStrikeBehaviour';
import { pulse, type PulseConfig, type PulseBehaviour } from './PulseBehaviour';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';

export const CastBehaviours = {
    MeleeAttack: (): MeleeAttackBehaviour => new MeleeAttackBehaviour(),
    Dash: (): DashBehaviour => new DashBehaviour(),
    /** Sets the caster's ability note at window open. Replaces doCardEffect initialization. */
    InitAbilityNote: (noteData: unknown): InitAbilityNoteBehaviour => new InitAbilityNoteBehaviour(noteData),
    /** Fires a projectile toward a pixel target at window open. Pair with ON_PROJECTILE_EXPIRED abilityEvents for on-hit effects. */
    ProjectileLaunch: (): ProjectileLaunchBehaviour => new ProjectileLaunchBehaviour(),
    /** Fires `fn(ctx)` once when the timing window is entered, or when it ends with `{ at: 'end' }`. Replaces `if (prevTime > 0) return` gates. */
    Instant: (fn: (ctx: CastBehaviourTickContext) => void, opts?: InstantOptions): InstantBehaviour => new InstantBehaviour(fn, opts),
    /** Render-only lunge of the caster along `direction` over its window. */
    CasterSlide: (config: CasterSlideConfig): CasterSlideBehaviour => new CasterSlideBehaviour(config),
    /** Render-only jitter whose amplitude ramps from `from` to `to` over its window. Deterministic. */
    CasterShake: (config: CasterShakeConfig): CasterShakeBehaviour => new CasterShakeBehaviour(config),
    /** Lunge movement plus a damage sweep along the path (wraps `LungeMovement`). Used by `ChargeAttack` / `MultiChargeAttack`. */
    Charge: <TNote extends ChargeNoteLike>(config: ChargeConfig<TNote>): ChargeBehaviour<TNote> => createCharge(config),
    /** Spawns a batch of units at chosen positions through the shared spawner core; can replace the previous batch. */
    SpawnUnits: (config: SpawnUnitsConfig): SpawnUnitsBehaviour => SpawnUnits(config),
    /** Airborne flight of the caster to a point (via knockback), with landing hooks. */
    Leap: (config: LeapConfig): LeapBehaviour => Leap(config),
    /** Lays a patch of ground effect (e.g. thorns) at a chosen point, with ownership replace rules. */
    GroundPatch: (config: GroundPatchConfig): GroundPatchBehaviour => GroundPatch(config),
    /** Fluent terrain interaction (damage / consume rock, etc.) at a chosen point or tile area. Chain `.atPoint(...)`, `.damageRock()`, ... */
    TerrainStrike: (): TerrainStrikeBehaviour => terrainStrike(),
    /** Repeated pulses through its window; the damage function receives the pulse number. */
    Pulse: (config: PulseConfig): PulseBehaviour => pulse(config),
};

export { BaseAttackBehaviour } from './BaseAttackBehaviour';
