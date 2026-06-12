/**
 * Pure math for gun cone spread — kept separate from gunHelpers to avoid
 * circular imports when previewHelpers loads (gunHelpers imports Projectile → AbilityRegistry).
 */

export function getDistanceBasedInaccuracy(
    distance: number,
    baseInaccuracy: number,
    minDistance: number = 50,
    maxAccurateDist: number = 400,
): number {
    if (!Number.isFinite(distance) || distance <= 0) return baseInaccuracy;
    if (distance <= minDistance) return baseInaccuracy * 2;
    if (distance >= maxAccurateDist) return baseInaccuracy;
    const t = (distance - minDistance) / (maxAccurateDist - minDistance);
    const factor = 2 - 1 * t;
    return baseInaccuracy * factor;
}
