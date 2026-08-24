/** Render discrete Light orbs instead of a continuous bar when max is below this. */
export const LIGHT_ORB_BAR_THRESHOLD = 10;

/** Warm fill used by both the continuous Light bar and filled orbs. */
export const LIGHT_BAR_FILL_GRADIENT = 'linear-gradient(90deg, #fffbeb, #fef08a, #fde047, #fbbf24)';

export function shouldRenderLightAsOrbs(max: number): boolean {
    return max < LIGHT_ORB_BAR_THRESHOLD;
}

/** Orb `index` (0-based) is filled when current Light is greater than that index. */
export function isLightOrbFilled(current: number, orbIndex: number): boolean {
    return current > orbIndex;
}
