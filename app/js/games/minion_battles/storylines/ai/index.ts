/**
 * Mission AI - UnitAIController interface, implementations, and factory.
 */

import type { UnitAIController } from './types';
import { LegacyAIController } from './LegacyAIController';
import { DefensePointsAIController } from './DefensePointsAIController';
import { StateBasedAIController } from './StateBasedAIController';

export type AIControllerId = 'legacy' | 'defensePoints' | 'stateBased';

const CONTROLLERS: Record<AIControllerId, UnitAIController> = {
    legacy: LegacyAIController,
    defensePoints: DefensePointsAIController,
    stateBased: StateBasedAIController,
};

/**
 * Build the AI controller for a mission. Defaults to 'stateBased' when mission does not define aiController.
 */
export function buildAIController(aiControllerId?: string | null): UnitAIController {
    const id: AIControllerId =
        aiControllerId === 'defensePoints'
            ? 'defensePoints'
            : aiControllerId === 'legacy'
              ? 'legacy'
              : 'stateBased';
    return CONTROLLERS[id] ?? StateBasedAIController;
}

export type { UnitAIController, AIContext } from './types';
export {
    findEnemies,
    findAIAbilityTarget,
    buildResolvedTargets,
    applyAIMovementToUnit,
    applyAIMovementToPosition,
    distance,
    getEnemiesInPerceptionAndLOS,
    getOrPickClosestDefendPoint,
    tryQueueAbilityOrder,
    queueWaitAndEndTurn,
} from './utils';
export type { ApplyAIMovementParams, GridLike } from './utils';
export { LegacyAIController, DefensePointsAIController, StateBasedAIController };
export { AIState, IdleState, AttackState, SiegeDefendPointState, FindLightState, WanderState } from './states';
