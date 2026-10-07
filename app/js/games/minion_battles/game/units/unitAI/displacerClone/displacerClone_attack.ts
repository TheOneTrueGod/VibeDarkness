/**
 * displacerClone_attack - Positioning only: hover at ~70% bolt range from the nearest player with
 * playful stop/start movement. Clones never choose attacks themselves; they fire only when the
 * Displacer Spirit mirroring code orders them to.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { DisplacerCloneAITreeContext, DisplacerCloneNodeId } from './context';
import { applyKiteMovement } from '../displacer/displacerKite';
import { getEnemiesInRangeNearestFirst } from '../displacer/displacerPerception';
import { despawnIfOrphaned } from '../displacer/despawnIfOrphaned';

function sight(unit: Unit): number | undefined {
    return (unit.aiContext as DisplacerCloneAITreeContext).sightRadius;
}

export const displacerClone_attack: AINode<'displacerClone', DisplacerCloneNodeId> = {
    nodeId: 'displacerClone_attack',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            if (despawnIfOrphaned(unit, context)) return;
            const ctx = unit.aiContext as DisplacerCloneAITreeContext;
            const target = getEnemiesInRangeNearestFirst(unit, context, sight(unit))[0];
            if (!target) {
                ctx.aiState = 'displacerClone_idle';
                return;
            }
            ctx.targetUnitId = target.id;
            applyKiteMovement(unit, target, context);
            context.emitTurnEnd(unit.id);
        },
    },
    edges: [
        {
            targetNodeId: 'displacerClone_idle',
            evaluate(unit: Unit, context: AIContext): boolean {
                return getEnemiesInRangeNearestFirst(unit, context, sight(unit)).length === 0;
            },
        },
    ],
};
