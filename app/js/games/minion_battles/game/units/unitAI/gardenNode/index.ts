/**
 * gardenNode UnitAITree - AI for every Garden Heart node. Idle (wait for sight) -> Attack (cast, and a Bud drifts).
 */

import type { UnitAITree } from '../types';
import type { GardenNodeId } from './context';
import { gardenNode_idle } from './gardenNode_idle';
import { gardenNode_attack } from './gardenNode_attack';

export type { GardenNodeId, GardenNodeAITreeContext } from './context';
export { canNodeMove } from './gardenNodeRules';

export const GARDEN_NODE_AI_TREE: UnitAITree<'gardenNode', GardenNodeId> = {
    name: 'gardenNode',
    entryNodeId: 'gardenNode_idle',
    nodes: {
        gardenNode_idle,
        gardenNode_attack,
    },
};
