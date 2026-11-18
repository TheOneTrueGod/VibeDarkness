/**
 * Burrowing projectile: travels under the ground. Nothing shows above ground but the churned-earth trail from its
 * launch point and the heaped mound on its heels, drawn like a burrowing unit (`burrowTrailDrawing.ts`). Colour is
 * the projectile's `trailColor` (default the generic burrow dirt). Drawn at ground-mark height, under units.
 *
 * Launch with `CastBehaviours.ProjectileLaunch().withProjectileType(BURROWING_PROJECTILE_TYPE)`, usually with
 * `withPassThroughEnemies()` so it hits nothing on the way and the ability acts in `onProjectileExpired`.
 */

import { Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';
import { drawBurrowMound, drawBurrowTrail } from '../../GameRenderer/renderers/burrowTrailDrawing';
import { DEFAULT_BURROW_DIRT_COLOR } from '../../units/unitRenderOptions';

export const BURROWING_PROJECTILE_TYPE = 'burrowing';

/** Same layer as unit ground marks (just under units). */
const Z_BURROWING = 9;
/** Smallest size the mound is drawn at, so a tiny hit radius still reads as a burrower. */
const MIN_MOUND_SIZE = 10;

export const burrowingDef: IProjectileDef = {
    createVisual() {
        const g = new Graphics();
        g.eventMode = 'none';
        return g;
    },
    updateVisual(visual, proj) {
        const g = visual as Graphics;
        g.clear();
        visual.zIndex = Z_BURROWING;
        visual.rotation = 0;
        visual.scale.set(1);
        visual.alpha = 1;

        const speed = Math.hypot(proj.velocityX, proj.velocityY);
        const ux = speed > 0 ? proj.velocityX / speed : 0;
        const uy = speed > 0 ? proj.velocityY / speed : 0;
        const size = Math.max(MIN_MOUND_SIZE, proj.radius * 2);
        const color = proj.trailColor ?? DEFAULT_BURROW_DIRT_COLOR;
        // Local coordinates: the visual sits on the projectile, the trail runs back to where it went under.
        const origin = { x: -ux * proj.distanceTraveled, y: -uy * proj.distanceTraveled };
        drawBurrowTrail(g, origin, { x: 0, y: 0 }, size, color, 0.55);
        drawBurrowMound(g, 0, 0, ux, uy, size, color);
    },
};
