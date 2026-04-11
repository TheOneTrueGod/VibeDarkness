/**
 * AlphaWolfBoss tree AI context.
 */

import type { UnitAIContextBase } from '../contextBase';

export type AlphaWolfBossNodeId = 'alphaWolfBoss_idle' | 'alphaWolfBoss_attack';

export interface AlphaWolfBossAITreeContext extends UnitAIContextBase {
    aiTree: 'alphaWolfBoss';
    aiState?: AlphaWolfBossNodeId;
    /** Sight radius (px) to detect players before charging. */
    sightRadius?: number;
    /** Unit ID of current prey for this round. */
    preyUnitId?: string;
}
