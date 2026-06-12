import { MeleeAttackBehaviour } from './MeleeAttack';
import { DashBehaviour } from './DashBehaviour';
import { InitAbilityNoteBehaviour } from './InitAbilityNoteBehaviour';
import { ProjectileLaunchBehaviour } from './ProjectileLaunchBehaviour';
import { InstantBehaviour } from './InstantBehaviour';
import type { CastBehaviourTickContext } from '../castBehaviourTypes';

export const CastBehaviours = {
    MeleeAttack: (): MeleeAttackBehaviour => new MeleeAttackBehaviour(),
    Dash: (): DashBehaviour => new DashBehaviour(),
    /** Sets the caster's ability note at window open. Replaces doCardEffect initialization. */
    InitAbilityNote: (noteData: unknown): InitAbilityNoteBehaviour => new InitAbilityNoteBehaviour(noteData),
    /** Fires a projectile toward a pixel target at window open. Pair with ON_PROJECTILE_EXPIRED abilityEvents for on-hit effects. */
    ProjectileLaunch: (): ProjectileLaunchBehaviour => new ProjectileLaunchBehaviour(),
    /** Fires `fn(ctx)` exactly once when the timing window is entered. Replaces `if (prevTime > 0) return` gates. */
    Instant: (fn: (ctx: CastBehaviourTickContext) => void): InstantBehaviour => new InstantBehaviour(fn),
};

export { BaseAttackBehaviour } from './BaseAttackBehaviour';
