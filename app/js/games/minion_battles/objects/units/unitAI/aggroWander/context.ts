/**
 * AggroWander tree AI context.
 */

import type { UnitAIContextBase } from '../contextBase';

export type AggroWanderNodeId = 'aggroWander_wander' | 'aggroWander_attack';

export interface AggroWanderAITreeContext extends UnitAIContextBase {
    aiTree: 'aggroWander';
    aiState?: AggroWanderNodeId;
    /** Starting grid column (anchor for wander radius). */
    startCol?: number;
    /** Starting grid row (anchor for wander radius). */
    startRow?: number;
    /** gameTime when last wander move was picked. */
    lastMoveTime?: number;
    /** gameTime when last enemy scan was performed. */
    lastScanTime?: number;
}
