/**
 * LeashAttackState – Behaves like AttackState: move to range and use ability.
 * Transitions back to LeashState when no enemies nearby.
 */

import type { Unit } from '../../../objects/Unit';
import type { AIContext } from '../types';
import { findEnemies, applyAIMovementToUnit, tryQueueAbilityOrder } from '../utils';
import { AIState } from './AIState';
import type { SerializedAIState } from './AIState';
import { LeashState } from './LeashState';

export interface LeashAttackStateParams {
    targetUnitId: string;
    startCol?: number;
    startRow?: number;
}

export class LeashAttackState extends AIState {
    readonly stateId = 'leashAttack' as const;
    readonly targetUnitId: string;
    readonly startCol: number;
    readonly startRow: number;

    constructor(params: LeashAttackStateParams) {
        super();
        this.targetUnitId = params.targetUnitId;
        this.startCol = params.startCol ?? 0;
        this.startRow = params.startRow ?? 0;
    }

    executeTurn(unit: Unit, context: AIContext): void {
        const target = context.getUnit(this.targetUnitId);
        if (!target?.isAlive()) {
            this.setState(unit, new LeashState({ startCol: this.startCol, startRow: this.startRow }));
            context.emitTurnEnd(unit.id);
            return;
        }
        const enemies = findEnemies(unit, context.getUnits());
        const targetInEnemies = enemies.filter((e) => e.id === this.targetUnitId);
        if (targetInEnemies.length === 0) {
            this.setState(unit, new LeashState({ startCol: this.startCol, startRow: this.startRow }));
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
        return {
            stateId: 'leashAttack',
            targetUnitId: this.targetUnitId,
            startCol: this.startCol,
            startRow: this.startRow,
        };
    }

    static fromJSON(data: SerializedAIState): LeashAttackState {
        return new LeashAttackState({
            targetUnitId: (data.targetUnitId as string) ?? '',
            startCol: data.startCol as number | undefined,
            startRow: data.startRow as number | undefined,
        });
    }
}
