/**
 * How each use pip on an ability card is drawn, left to right.
 * - `filled`: a use the click can spend.
 * - `goneAtRewind`: a use that exists now but not at the rewind target; drawn hollow with a red outline.
 * - `empty`: no use.
 */
export type UseDiamondState = 'filled' | 'goneAtRewind' | 'empty';

/**
 * Pip states for a card. `rewindUses` is set while a click would rewind an ITS preview
 * (`getRewindTargetUnit`): the click acts at the rewind target, so its uses are the filled pips, and any
 * live uses beyond them (for example a round refill during the preview's windup) get the red outline.
 */
export function getUseDiamondStates(
    liveUses: number,
    maxUses: number,
    rewindUses: number | null = null,
): UseDiamondState[] {
    const count = Math.max(1, maxUses);
    const clamp = (n: number) => Math.max(0, Math.min(count, n));
    const live = clamp(liveUses);
    const usable = rewindUses == null ? live : clamp(rewindUses);
    return Array.from({ length: count }, (_, index) => {
        if (index < usable) return 'filled';
        if (index < live) return 'goneAtRewind';
        return 'empty';
    });
}
