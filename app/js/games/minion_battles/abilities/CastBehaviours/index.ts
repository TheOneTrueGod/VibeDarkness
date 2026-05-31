import { MeleeAttackBehaviour } from './MeleeAttack';

export const CastBehaviours = {
    MeleeAttack: (): MeleeAttackBehaviour => new MeleeAttackBehaviour(),
};

export { BaseAttackBehaviour } from './BaseAttackBehaviour';
