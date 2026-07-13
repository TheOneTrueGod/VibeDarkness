import { Container, Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';

// Fixed thickness (along the travel direction) of each line, in world units — baked into the
// geometry at creation, so it never scales with travel progress. Lines are placed flush
// against each other (no gap) so they read as one tapering wavefront.
const LINE_THICKNESS = 6;
// Front-to-back alpha falloff — one entry per line, leading line first.
const LINE_ALPHAS = [0.9, 0.55, 0.3];
// Front-to-back width (length across the cone) falloff, as a fraction of the current cone
// width — each trailing line is narrower than the one in front of it.
const LINE_WIDTH_FACTORS = [1, 0.7, 0.45];

/**
 * Burst's traveling wave — drawn as a leading line plus two fainter, narrower trailing lines
 * behind it, each spanning (a fraction of) the cone's breadth at the projectile's current
 * (leading-edge) position, giving a tapering trailing-wave look instead of a single flat
 * rectangle. Each line's length grows with `distanceTraveled` to match the cone's width at
 * that distance (`rectStartWidth`/`rectEndWidth` on the Projectile); their thickness along the
 * travel direction is fixed and does not scale — only each line's own y-scale (its length) is
 * animated per frame.
 */
export const bloodWaveDef: IProjectileDef = {
    createVisual(_proj) {
        const container = new Container();
        LINE_ALPHAS.forEach((alpha, i) => {
            const frontEdge = -i * LINE_THICKNESS;
            const g = new Graphics();
            g.rect(frontEdge - LINE_THICKNESS, -0.5, LINE_THICKNESS, 1);
            g.fill({ color: 0x8b1220, alpha });
            container.addChild(g);
        });
        return container;
    },
    updateVisual(visual, proj) {
        const progress = proj.maxDistance > 0 ? Math.min(1, proj.distanceTraveled / proj.maxDistance) : 1;
        const startWidth = proj.rectStartWidth ?? 4;
        const endWidth = proj.rectEndWidth ?? 4;
        const width = startWidth + (endWidth - startWidth) * progress;
        visual.children.forEach((child, i) => {
            child.scale.y = width * (LINE_WIDTH_FACTORS[i] ?? 1);
        });
        visual.rotation = Math.atan2(proj.velocityY, proj.velocityX);
    },
};
