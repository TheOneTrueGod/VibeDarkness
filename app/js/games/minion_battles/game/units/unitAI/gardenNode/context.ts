/**
 * gardenNode tree AI context (the Garden Heart and every node kind: Thornspitter, Pod Mortar, Mender Bloom, Hive Gourd,
 * Creeper).
 */

import type { UnitAIContextBase } from '../contextBase';

export type GardenNodeId = 'gardenNode_idle' | 'gardenNode_attack';

export interface GardenNodeAITreeContext extends UnitAIContextBase {
    aiTree: 'gardenNode';
    aiState?: GardenNodeId;
}
