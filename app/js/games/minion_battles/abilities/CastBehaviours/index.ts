import { MeleeAttackBehaviour } from './MeleeAttack';
import { DashBehaviour } from './DashBehaviour';
import { InitAbilityNoteBehaviour } from './InitAbilityNoteBehaviour';

export const CastBehaviours = {
    MeleeAttack: (): MeleeAttackBehaviour => new MeleeAttackBehaviour(),
    Dash: (): DashBehaviour => new DashBehaviour(),
    /** Sets the caster's ability note at window open. Replaces doCardEffect initialization. */
    InitAbilityNote: (noteData: unknown): InitAbilityNoteBehaviour => new InitAbilityNoteBehaviour(noteData),
};

export { BaseAttackBehaviour } from './BaseAttackBehaviour';
