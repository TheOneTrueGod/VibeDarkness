/**
 * State-based AI states. Register all for serialization (fromJSON).
 */

import { AIState } from './AIState';
import { IdleState } from './IdleState';
import { AttackState } from './AttackState';
import { SiegeDefendPointState } from './SiegeDefendPointState';
import { FindLightState } from './FindLightState';
import { WanderState } from './WanderState';
import { LeashState } from './LeashState';
import { LeashAttackState } from './LeashAttackState';

function registerStates(): void {
    AIState.register('idle', (d) => IdleState.fromJSON(d));
    AIState.register('attack', (d) => AttackState.fromJSON(d));
    AIState.register('siegeDefendPoint', (d) => SiegeDefendPointState.fromJSON(d));
    AIState.register('findLight', (d) => FindLightState.fromJSON(d));
    AIState.register('wander', (d) => WanderState.fromJSON(d));
    AIState.register('leash', (d) => LeashState.fromJSON(d));
    AIState.register('leashAttack', (d) => LeashAttackState.fromJSON(d));
}
registerStates();

export { AIState, IdleState, AttackState, SiegeDefendPointState, FindLightState, WanderState, LeashState, LeashAttackState };
export type { SerializedAIState, AIStateId } from './AIState';
export type { AttackStateParams } from './AttackState';
export type { SiegeDefendPointStateParams } from './SiegeDefendPointState';
export type { FindLightStateParams } from './FindLightState';
export type { WanderStateParams } from './WanderState';
export type { LeashStateParams } from './LeashState';
export type { LeashAttackStateParams } from './LeashAttackState';
