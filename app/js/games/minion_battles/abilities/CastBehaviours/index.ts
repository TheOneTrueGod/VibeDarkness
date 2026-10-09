import { MeleeAttackBehaviour } from './MeleeAttack';
import { DashBehaviour } from './DashBehaviour';
import { InitAbilityNoteBehaviour } from './InitAbilityNoteBehaviour';
import { ProjectileLaunchBehaviour } from './ProjectileLaunchBehaviour';
import { InstantBehaviour, type InstantOptions } from './InstantBehaviour';
import { CasterSlideBehaviour, type CasterSlideConfig } from './CasterSlideBehaviour';
import { CasterShakeBehaviour, type CasterShakeConfig } from './CasterShakeBehaviour';
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
};

export { BaseAttackBehaviour } from './BaseAttackBehaviour';
