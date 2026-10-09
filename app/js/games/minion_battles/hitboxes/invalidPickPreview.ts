/**
 * Shared drawing for a pick the ability would reject (`validatePick` returns false).
 *
 * Hitboxes call this from `renderInvalidPreview`. The drawing never clears `gr`: ghost previews
 * share one layer across several committed picks.
 */

import type { IAbilityPreviewGraphics } from '../abilities/Ability';
import { TELEGRAPH_STYLES } from '../abilities/telegraphStyles';

/** Half-width of the default invalid cross, in px. */
export const INVALID_PICK_CROSS_HALF_SIZE = 14;

/** Grey cross centred on (x, y). */
export function drawInvalidPickCross(
    gr: IAbilityPreviewGraphics,
    x: number,
    y: number,
    halfSize: number = INVALID_PICK_CROSS_HALF_SIZE,
): void {
    gr.moveTo(x - halfSize, y - halfSize);
    gr.lineTo(x + halfSize, y + halfSize);
    gr.moveTo(x + halfSize, y - halfSize);
    gr.lineTo(x - halfSize, y + halfSize);
    gr.stroke({ color: TELEGRAPH_STYLES.invalid.color, width: 3, alpha: 0.95 });
}
