/**
 * StateBasedAIController – Delegates to the unit's current AIState (Idle, Attack, SiegeDefendPoint, FindLight, Wander).
 * State is stored as JSON in unit.aiContext.aiStateSerialized for server sync; deserialized each turn to run.
 */

import type { Unit } from '../../objects/Unit';
import type { UnitAIController, AIContext } from './types';
import { AIState, IdleState } from './states';

export const StateBasedAIController: UnitAIController = {
    executeTurn(unit: Unit, context: AIContext): void {
        const state = this.getState(unit);
        state.executeTurn(unit, context);
    },

    onPathfindingRetrigger(unit: Unit, context: AIContext): void {
        const state = this.getState(unit);
        if (state.onPathfindingRetrigger) {
            state.onPathfindingRetrigger(unit, context);
        }
    },

    getState(unit: Unit): AIState {
        const data = unit.aiContext?.aiStateSerialized;
        if (data && typeof data === 'object' && data.stateId) {
            return AIState.fromJSON(data as Record<string, unknown>);
        }
        return new IdleState();
    },
};
