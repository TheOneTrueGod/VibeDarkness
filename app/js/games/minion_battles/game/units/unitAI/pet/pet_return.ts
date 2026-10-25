/**
 * pet_return — Return to the owner, ignoring enemies.
 *
 * Chases directly to the owner. Transitions to pet_follow once close enough.
 */

import type { Unit } from '../../Unit';
import type { AIContext, AINode } from '../types';
import type { PetAITreeContext, PetNodeId } from './context';
import { queueWaitAndEndTurn, distance } from '../utils';
import { petStateOf } from '../../components/petComponent';

const FOLLOW_DISTANCE = 50;

export const pet_return: AINode<'pet', PetNodeId> = {
    nodeId: 'pet_return',
    actions: {
        execute(unit: Unit, context: AIContext): void {
            const ctx = unit.aiContext as PetAITreeContext;

            // Heel overrides return
            if ((ctx.heelUntilGameTime ?? 0) > context.gameTime) {
                ctx.aiState = 'pet_heel';
                return;
            }

            const owner = petStateOf(unit).ownerUnitId ? context.getUnit(petStateOf(unit).ownerUnitId!) : null;

            if (!owner?.isAlive()) {
                ctx.aiState = 'pet_follow';
                return;
            }

            const dist = distance(unit.x, unit.y, owner.x, owner.y);
            if (dist <= FOLLOW_DISTANCE) {
                ctx.aiState = 'pet_follow';
                return;
            }

            context.nav.chaseUnit(unit, owner, { stopRange: FOLLOW_DISTANCE });
            queueWaitAndEndTurn(unit, context);
        },
    },
    edges: [
        {
            targetNodeId: 'pet_heel',
            evaluate(unit: Unit, context: AIContext): boolean {
                const ctx = unit.aiContext as PetAITreeContext;
                return (ctx.heelUntilGameTime ?? 0) > context.gameTime;
            },
        },
        {
            targetNodeId: 'pet_follow',
            evaluate(unit: Unit, context: AIContext): boolean {
                const owner = petStateOf(unit).ownerUnitId ? context.getUnit(petStateOf(unit).ownerUnitId!) : null;
                if (!owner?.isAlive()) return true;
                return distance(unit.x, unit.y, owner.x, owner.y) <= FOLLOW_DISTANCE;
            },
        },
    ],
};
