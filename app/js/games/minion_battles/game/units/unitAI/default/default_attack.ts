/**
 * default_attack - Move to ideal range and use best ability (by priority) on target.
 */

import type { Unit } from '../../Unit';
import type { AIContext } from '../types';
import type { AINode } from '../types';
import type { DefaultAITreeContext, DefaultNodeId } from './context';
import { findEnemies, applyAIMovementToUnit, tryQueueAbilityOrder } from '../utils';

export const default_attack: AINode<'default', DefaultNodeId> = {
    nodeId: 'default_attack',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as DefaultAITreeContext;
            const targetId = ctx.targetUnitId;
            const target = targetId ? context.getUnit(targetId) : null;
            if (!target?.isAlive()) {
                ctx.aiState = 'default_idle';
                ctx.targetUnitId = undefined;
                context.emitTurnEnd(unit.id);
                return;
            }
            const enemies = findEnemies(unit, context.getUnits());
            const targetInEnemies = enemies.filter((e) => e.id === targetId);
            if (targetInEnemies.length === 0) {
                ctx.aiState = 'default_idle';
                ctx.targetUnitId = undefined;
                context.emitTurnEnd(unit.id);
                return;
            }
            applyAIMovementToUnit(unit, target, context);
            if (tryQueueAbilityOrder(unit, context, targetInEnemies)) return;
            context.emitTurnEnd(unit.id);
        },
    },
    edges: [
        {
            targetNodeId: 'default_idle',
            evaluate(unit: Unit, _context: AIContext): boolean {
                const ctx = unit.aiContext as DefaultAITreeContext;
                const targetId = ctx.targetUnitId;
                const target = targetId ? _context.getUnit(targetId) : null;
                return !target?.isAlive();
            },
        },
    ],
};
