/**
 * Mission predicates shared by victory checks and triggers. `evaluateVictoryCondition` is the
 * leaf evaluator; `evaluateTriggerCondition` adds and / or / not and trigger-state checks on top.
 */

import { UnitTag } from '../units/unitTag';
import type { EngineContext } from '../EngineContext';
import type { VictoryCondition } from '../../storylines/types';
import { isTileInNearPositionArea } from '../../storylines/nearPositionArea';
import type { TriggerCondition } from './triggerTypes';

export type MissionConditionContext = Pick<
    EngineContext,
    'units' | 'terrainManager' | 'roundNumber' | 'isObjectiveCompleted'
>;

export function evaluateVictoryCondition(ctx: MissionConditionContext, cond: VictoryCondition): boolean {
    if (cond.type === 'eliminateAllEnemies') {
        const hasEnemies = ctx.units.some(
            (u) => u.isAlive() && u.teamId === 'enemy' && !u.tags.includes(UnitTag.Clone),
        );
        return !hasEnemies;
    }
    if (cond.type === 'allUnitsNearPosition') {
        const alivePlayers = ctx.units.filter((u) => u.isPlayerControlled() && u.isAlive());
        if (alivePlayers.length === 0) return false;
        const grid = ctx.terrainManager?.grid;
        if (!grid) return false;
        return alivePlayers.every((u) => {
            const { col: uc, row: ur } = grid.worldToGrid(u.x, u.y);
            return isTileInNearPositionArea(cond, uc, ur);
        });
    }
    if (cond.type === 'unitDead') {
        const hasTargetAlive = ctx.units.some(
            (u) => u.isAlive() && u.characterId === cond.unitCharacterId,
        );
        return !hasTargetAlive;
    }
    if (cond.type === 'atLeastRound') {
        return ctx.roundNumber >= cond.round;
    }
    if (cond.type === 'objectiveCompleted') {
        return ctx.isObjectiveCompleted(cond.objectiveId);
    }
    if (cond.type === 'aliveUnitCount') {
        const count = ctx.units.filter(
            (u) => u.isAlive() && u.characterId === cond.characterId,
        ).length;
        return count >= cond.minCount;
    }
    return false;
}

export function evaluateTriggerCondition(
    ctx: MissionConditionContext,
    cond: TriggerCondition,
    hasTriggerFired: (triggerId: string) => boolean,
): boolean {
    switch (cond.type) {
        case 'and':
            return cond.conditions.every((c) => evaluateTriggerCondition(ctx, c, hasTriggerFired));
        case 'or':
            return cond.conditions.some((c) => evaluateTriggerCondition(ctx, c, hasTriggerFired));
        case 'not':
            return !evaluateTriggerCondition(ctx, cond.condition, hasTriggerFired);
        case 'triggerFired':
            return hasTriggerFired(cond.triggerId);
        default:
            return evaluateVictoryCondition(ctx, cond);
    }
}
