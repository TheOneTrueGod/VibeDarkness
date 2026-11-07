/**
 * Juggernaut ring: while an enemy is in a juggernaut window (it cannot be interrupted, knocked back or
 * hurt by terrain hazards), its soft red glow is replaced by a solid red band with an inner border in the
 * juggernaut colour (`ABILITY_TIMING_TAG_COLORS.juggernaut`, the same sky blue as the battle timeline).
 *
 * Render-only: reads `unit.isInJuggernautWindow(gameTime)` each frame, keeps no game state.
 */

import { Graphics, type Container } from 'pixi.js';
import type { Unit } from '../../units/Unit';
import { ABILITY_TIMING_TAG_COLORS } from '../../../abilities/abilityTimings';
import { ENEMY_GLOW_COLOR, GLOW_RADIUS } from '../../units/unit_defs/unitDef';

export const JUGGERNAUT_RING_LABEL = 'juggernautRing';

/** Juggernaut tag colour as a Pixi number. */
export const JUGGERNAUT_RING_INNER_COLOR = parseInt(ABILITY_TIMING_TAG_COLORS.juggernaut.slice(1), 16);
/** Width (px) of the inner juggernaut-coloured border, inside the red band. */
export const JUGGERNAUT_RING_INNER_WIDTH = 2.5;

/** True when this unit should show the juggernaut ring: an enemy of the viewer, in a juggernaut window. */
export function shouldShowJuggernautRing(unit: Unit, gameTime: number, isEnemyOfViewer: boolean): boolean {
    return isEnemyOfViewer && unit.isAlive() && unit.isInJuggernautWindow(gameTime);
}

/** Draw the band: solid red out to the glow radius, juggernaut colour along its inner edge (against the body). */
export function drawJuggernautRing(g: Graphics, radius: number): void {
    g.clear();
    g.circle(0, 0, radius + GLOW_RADIUS);
    g.fill({ color: ENEMY_GLOW_COLOR, alpha: 1 });
    g.circle(0, 0, radius + JUGGERNAUT_RING_INNER_WIDTH / 2);
    g.stroke({ color: JUGGERNAUT_RING_INNER_COLOR, width: JUGGERNAUT_RING_INNER_WIDTH });
}

/**
 * Show or hide the ring on a unit visual. Created lazily just above the glow (so it stays under the body),
 * and the glow is hidden while the ring shows. Redrawn only when shown, so a radius change (grow animation)
 * is picked up.
 */
export function syncJuggernautRing(visual: Container, unit: Unit, show: boolean): void {
    let ring = visual.children.find((c) => c.label === JUGGERNAUT_RING_LABEL) as Graphics | undefined;
    const glow = visual.children.find((c) => c.label === 'glow');
    if (!show) {
        if (ring) ring.visible = false;
        return;
    }
    if (!ring) {
        ring = new Graphics();
        ring.label = JUGGERNAUT_RING_LABEL;
        const glowIndex = glow ? visual.getChildIndex(glow) : -1;
        visual.addChildAt(ring, glowIndex + 1);
    }
    drawJuggernautRing(ring, unit.radius);
    ring.visible = true;
    if (glow) glow.visible = false;
}
