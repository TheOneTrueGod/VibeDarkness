import type { UnitAITree } from '../types';
import type { PetNodeId } from './context';
import { pet_follow } from './pet_follow';
import { pet_engage } from './pet_engage';
import { pet_return } from './pet_return';
import { pet_heel } from './pet_heel';

export type { PetNodeId } from './context';
export type { PetAITreeContext } from './context';

export const PET_AI_TREE: UnitAITree<'pet', PetNodeId> = {
    name: 'pet',
    entryNodeId: 'pet_follow',
    nodes: {
        pet_follow,
        pet_engage,
        pet_return,
        pet_heel,
    },
};
