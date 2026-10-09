/**
 * Shared easing curves for cast behaviours and ability UI animation. Input is clamped to [0, 1].
 */

export function easeOutCubic(t: number): number {
    const c = Math.max(0, Math.min(1, t));
    return 1 - (1 - c) ** 3;
}

export function easeInOutQuad(t: number): number {
    const c = Math.max(0, Math.min(1, t));
    return c < 0.5 ? 2 * c * c : 1 - ((-2 * c + 2) ** 2) / 2;
}
