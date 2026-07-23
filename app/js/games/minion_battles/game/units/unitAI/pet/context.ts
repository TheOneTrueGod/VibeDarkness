import type { UnitAIContextBase } from '../contextBase';

export type PetNodeId =
    | 'pet_follow'
    | 'pet_engage'
    | 'pet_return'
    | 'pet_heel'
    | 'pet_ordered_move';

export interface PetAITreeContext extends UnitAIContextBase {
    aiTree: 'pet';
    aiState?: PetNodeId;
    targetUnitId?: string;
    /**
     * When true with {@link targetUnitId}, engage rescans must not steal focus until the
     * target dies / becomes unreachable or a new order clears the lock.
     */
    orderedFocus?: boolean;
    /** World-pixel destination for {@link pet_ordered_move}. */
    orderedMoveX?: number;
    orderedMoveY?: number;
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
