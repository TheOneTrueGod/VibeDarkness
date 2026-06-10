import type { UnitAIContextBase } from '../contextBase';

export type PetNodeId = 'pet_follow' | 'pet_engage' | 'pet_return' | 'pet_heel';

export interface PetAITreeContext extends UnitAIContextBase {
    aiTree: 'pet';
    aiState?: PetNodeId;
    targetUnitId?: string;
    /** gameTime when heel command expires and pet may re-engage. */
    heelUntilGameTime?: number;
    /** Maximum distance (px) from owner the pet holds during heel. */
    heelTetherRange?: number;
    /** gameTime when the pet last scanned for enemies. */
    lastScanTime?: number;
    /** World-space guard wander destination around the owner. */
    guardTargetX?: number;
    guardTargetY?: number;
    /** gameTime until the pet finishes dwelling at the current guard point. */
    guardDwellUntilGameTime?: number;
}
