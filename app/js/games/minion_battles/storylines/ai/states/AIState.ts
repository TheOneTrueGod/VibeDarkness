/**
 * Abstract base for state-based AI. Each state controls unit behaviour and can transition to another state.
 * States are serializable (toJSON/fromJSON) for server sync; the unit stores the serialized form in aiContext.aiStateSerialized.
 */

import type { Unit } from '../../../objects/Unit';
import type { AIContext } from '../types';

export const AI_STATE_ID_KEY = 'stateId';

export type AIStateId = 'idle' | 'attack' | 'siegeDefendPoint' | 'findLight' | 'wander' | 'leash' | 'leashAttack';

/** Serializable snapshot of an AI state. Must include stateId. */
export type SerializedAIState = Record<string, unknown> & { stateId: AIStateId };

/** Registry: stateId -> fromJSON factory. */
const stateRegistry: Map<AIStateId, (data: SerializedAIState) => AIState> = new Map();

export abstract class AIState {
    abstract readonly stateId: AIStateId;

    /** Execute one AI turn. May transition by setting unit.aiContext.aiStateSerialized to a new state's toJSON(). */
    abstract executeTurn(unit: Unit, context: AIContext): void;

    /** Optional: refresh path when pathfinding retrigger fires. */
    onPathfindingRetrigger?(_unit: Unit, _context: AIContext): void;

    /** Serialize for persistence (server sync). Must include stateId. */
    abstract toJSON(): SerializedAIState;

    /** Deserialize from saved state. Dispatches to registered state class by stateId. */
    static fromJSON(data: Record<string, unknown>): AIState {
        const stateId = (data?.stateId as AIStateId) ?? 'idle';
        const factory = stateRegistry.get(stateId);
        if (factory) return factory(data as SerializedAIState);
        return stateRegistry.get('idle')!(data as SerializedAIState);
    }

    /** Register a state class so fromJSON can instantiate it. */
    static register(stateId: AIStateId, factory: (data: SerializedAIState) => AIState): void {
        stateRegistry.set(stateId, factory);
    }

    // --- Helpers for subclasses ---

    protected setState(unit: Unit, state: AIState): void {
        unit.aiContext = { ...unit.aiContext, aiStateSerialized: state.toJSON() };
    }
}
