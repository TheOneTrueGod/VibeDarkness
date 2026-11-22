/**
 * gardenNode tree AI context (the Garden Heart and every node kind: Thornspitter, Pod Mortar, Hive Gourd, Creeper,
 * Gloam Lily).
 */

import type { UnitAIContextBase } from '../contextBase';

export type GardenNodeId = 'gardenNode_idle' | 'gardenNode_attack';

export interface GardenNodeAITreeContext extends UnitAIContextBase {
    aiTree: 'gardenNode';
    aiState?: GardenNodeId;
}
