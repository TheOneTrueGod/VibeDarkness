import type { UnitAIContextBase } from '../contextBase';

export type HuntNodeId = 'hunt_seek' | 'hunt_pursue';

export interface HuntAITreeContext extends UnitAIContextBase {
    aiTree: 'hunt';
    aiState?: HuntNodeId;
}
