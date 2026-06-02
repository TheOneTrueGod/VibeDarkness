import { MeleeAttackBehaviour } from './MeleeAttack';
import { DashBehaviour } from './DashBehaviour';

export const CastBehaviours = {
    MeleeAttack: (): MeleeAttackBehaviour => new MeleeAttackBehaviour(),
    Dash: (): DashBehaviour => new DashBehaviour(),
};

export { BaseAttackBehaviour } from './BaseAttackBehaviour';
