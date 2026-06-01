import type { UnitAIContextBase } from '../contextBase';

export type HuntNodeId = 'hunt_seek' | 'hunt_pursue';

export interface HuntAITreeContext extends UnitAIContextBase {
    aiTree: 'hunt';
    aiState?: HuntNodeId;
    /** gameTime of the last nearest-enemy rescan in hunt_pursue. */
    lastScanTime?: number;
}
