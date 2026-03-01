/**
 * Mission AI - UnitAIController interface, implementations, and factory.
 */

import type { UnitAIController } from './types';
import { LegacyAIController } from './LegacyAIController';
import { DefensePointsAIController } from './DefensePointsAIController';

export type AIControllerId = 'legacy' | 'defensePoints';

const CONTROLLERS: Record<AIControllerId, UnitAIController> = {
    legacy: LegacyAIController,
    defensePoints: DefensePointsAIController,
};

/**
 * Build the AI controller for a mission. Defaults to 'legacy' when mission does not define aiController.
 */
export function buildAIController(aiControllerId?: string | null): UnitAIController {
    const id: AIControllerId =
        aiControllerId === 'defensePoints' ? 'defensePoints' : 'legacy';
    return CONTROLLERS[id] ?? LegacyAIController;
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
export { LegacyAIController, DefensePointsAIController };
