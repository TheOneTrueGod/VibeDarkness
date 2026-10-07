/**
 * DisplacerClone tree AI context.
 */

import type { UnitAIContextBase } from '../contextBase';
import type { KiteState } from '../displacer/displacerKite';

export type DisplacerCloneNodeId = 'displacerClone_idle' | 'displacerClone_attack';

export interface DisplacerCloneAITreeContext extends UnitAIContextBase, KiteState {
    aiTree: 'displacerClone';
    aiState?: DisplacerCloneNodeId;
    sightRadius?: number;
}
