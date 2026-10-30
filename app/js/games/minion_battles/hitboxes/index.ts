export type { IHitbox, HitboxEngineContext, HitboxPreviewCaster } from './Hitbox';
export { Hitbox } from './Hitbox';
export { ThickLineHitbox } from './ThickLineHitbox';
export { CircleHitbox, unitOverlapsCircle } from './CircleHitbox';
export { HitboxSpec, MeleeLineHitboxSpec, meleeLineHitbox, PerpendicularSwingHitboxSpec, perpendicularSwingHitbox, NullHitboxSpec, nullHitbox, GroundPointHitboxSpec, groundPointHitbox, FacingConeHitboxSpec, facingConeHitbox } from './HitboxSpec';
export { UnitRangeHitboxSpec, unitRangeHitbox } from './UnitRangeHitboxSpec';
export { CircleAoEHitboxSpec, circleAoEHitbox, type CircleAoEPreviewStyle } from './CircleAoEHitboxSpec';
export { TruncatedConeHitboxSpec, type TruncatedConeGeometry, type TruncatedConeMinRadiusResolver } from './TruncatedConeHitbox';
export { ConvexQuadHitboxSpec, convexQuadHitbox } from './ConvexQuadHitbox';
export { AimFrameSegmentHitboxSpec, aimFrameSegmentHitbox, type AimFramePoint, type AimFrameSegmentConfig } from './AimFrameSegmentHitbox';
export {
    TileAreaHitboxSpec,
    tileAreaHitbox,
    tileShapes,
    type TileAreaAnchor,
    type TileAreaHitboxOptions,
    type TileOffset,
} from './TileAreaHitboxSpec';
