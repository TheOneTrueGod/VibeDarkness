/**
 * DisplacerClone UnitAITree - illusory copies of the Displacer Spirit.
 * Idle (wait for sight) -> Attack (hover at ~70% bolt range; casts come from boss mirroring).
 */

import type { UnitAITree } from '../types';
import type { DisplacerCloneNodeId } from './context';
import { displacerClone_idle } from './displacerClone_idle';
import { displacerClone_attack } from './displacerClone_attack';

export type { DisplacerCloneNodeId, DisplacerCloneAITreeContext } from './context';

export const DISPLACER_CLONE_AI_TREE: UnitAITree<'displacerClone', DisplacerCloneNodeId> = {
    name: 'displacerClone',
    entryNodeId: 'displacerClone_idle',
    nodes: {
        displacerClone_idle,
        displacerClone_attack,
    },
};
