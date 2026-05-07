/**
 * Lanternite patrol tree — shallow context keyed by discriminant aiTree only.
 */

import type { UnitAIContextBase } from '../contextBase';

export type LanternitePatrolNodeId = 'lantern_patrol';

export interface LanternitePatrolAITreeContext extends UnitAIContextBase {
    aiTree: 'lanternitePatrol';
    aiState?: LanternitePatrolNodeId;
}
