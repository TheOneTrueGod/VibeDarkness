/**
 * AttackState – Move to ideal range and use ability on target.
 */

import type { Unit } from '../../../objects/Unit';
import type { AIContext } from '../types';
import { findEnemies, applyAIMovementToUnit, tryQueueAbilityOrder } from '../utils';
import { AIState } from './AIState';
import type { SerializedAIState } from './AIState';
import { IdleState } from './IdleState';

export interface AttackStateParams {
    targetUnitId: string;
}

export class AttackState extends AIState {
    readonly stateId = 'attack' as const;
    readonly targetUnitId: string;

    constructor(params: AttackStateParams) {
        super();
        this.targetUnitId = params.targetUnitId;
    }

    executeTurn(unit: Unit, context: AIContext): void {
        const target = context.getUnit(this.targetUnitId);
        if (!target?.isAlive()) {
            this.setState(unit, new IdleState());
            context.emitTurnEnd(unit.id);
            return;
        }
        const enemies = findEnemies(unit, context.getUnits());
        const targetInEnemies = enemies.filter((e) => e.id === this.targetUnitId);
        if (targetInEnemies.length === 0) {
            this.setState(unit, new IdleState());
            context.emitTurnEnd(unit.id);
            return;
        }
        if (unit.aiSettings && context.terrainManager) {
            applyAIMovementToUnit(unit, target, {
                findGridPath: (fc, fr, tc, tr) => context.findGridPathForUnit(unit, fc, fr, tc, tr),
                worldToGrid: context.terrainManager.grid.worldToGrid.bind(context.terrainManager.grid),
                gameTick: context.gameTick,
                worldWidth: context.WORLD_WIDTH,
                worldHeight: context.WORLD_HEIGHT,
            });
        }
        if (tryQueueAbilityOrder(unit, context, targetInEnemies)) return;
    }

    onPathfindingRetrigger(unit: Unit, context: AIContext): void {
        const target = context.getUnit(this.targetUnitId);
        if (!target?.isAlive() || !unit.aiSettings || !context.terrainManager) return;
        applyAIMovementToUnit(unit, target, {
            findGridPath: (fc, fr, tc, tr) => context.findGridPathForUnit(unit, fc, fr, tc, tr),
            worldToGrid: context.terrainManager.grid.worldToGrid.bind(context.terrainManager.grid),
            gameTick: context.gameTick,
            worldWidth: context.WORLD_WIDTH,
            worldHeight: context.WORLD_HEIGHT,
        });
    }

    toJSON(): SerializedAIState {
        return { stateId: 'attack', targetUnitId: this.targetUnitId };
    }

    static fromJSON(data: SerializedAIState): AttackState {
        return new AttackState({
            targetUnitId: (data.targetUnitId as string) ?? '',
        });
    }
}
