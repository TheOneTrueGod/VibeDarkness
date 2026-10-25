/**
 * pet_heel — Hold close to owner; no engagement.
 *
 * Keeps within heelTetherRange of the owner. Transitions back to pet_follow
 * once heelUntilGameTime passes.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { PetAITreeContext, PetNodeId } from './context';
import { queueWaitAndEndTurn, distance } from '../utils';
import { petStateOf } from '../../components/petComponent';

export const pet_heel: AINode<'pet', PetNodeId> = {
    nodeId: 'pet_heel',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as PetAITreeContext;

            if ((ctx.heelUntilGameTime ?? 0) <= context.gameTime) {
                ctx.aiState = 'pet_follow';
                return;
            }

            const owner = petStateOf(unit).ownerUnitId ? context.getUnit(petStateOf(unit).ownerUnitId!) : null;
            const tetherRange = ctx.heelTetherRange ?? 30;

            if (owner?.isAlive() && distance(unit.x, unit.y, owner.x, owner.y) > tetherRange) {
                context.nav.chaseUnit(unit, owner, { stopRange: tetherRange });
            }

            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'pet_follow',
            evaluate(unit: Unit, context: AIContext): boolean {
                const ctx = unit.aiContext as PetAITreeContext;
                return (ctx.heelUntilGameTime ?? 0) <= context.gameTime;
            },
        },
    ],
};
