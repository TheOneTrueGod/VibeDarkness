/**
 * DisplacerBoss tree AI context.
 */

import type { UnitAIContextBase } from '../contextBase';
import type { KiteState } from '../displacer/displacerKite';

export type DisplacerBossNodeId = 'displacerBoss_idle' | 'displacerBoss_attack';

export interface DisplacerBossAITreeContext extends UnitAIContextBase, KiteState {
    aiTree: 'displacerBoss';
    aiState?: DisplacerBossNodeId;
    /** Sight radius (px) to notice players. Defaults to the unit def perception range. */
    sightRadius?: number;
}
