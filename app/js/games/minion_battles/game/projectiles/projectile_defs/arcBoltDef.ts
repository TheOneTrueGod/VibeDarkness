import { Container, Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';
import { drawLightningPath, stormHash01, stormSeedFromId } from '../../effect_defs/stormEffects';
import { getThemeById } from '../../../themes/abilityTheme';

export const ARC_BOLT_PROJECTILE_TYPE = 'arc_bolt';

/** Tail length behind the head (px, local space along -x). */
const TAIL_LENGTH = 26;
/** Tail re-forks per second of game time. */
const FLICKER_HZ = 30;

/**
 * Arc Bolt: a white-hot head in a cyan glow, dragging a crackling tail that re-forks every frame
 * bucket. The tail is drawn by the projectile itself (no `BulletTrail`), so the bolt reads as a
 * live spark rather than a thrown object. Colours are the Storm theme's (secondary glow, primary halo).
 */
export const arcBoltDef: IProjectileDef = {
    createVisual(_proj) {
        const container = new Container();
        container.addChild(new Graphics());
        return container;
    },
    updateVisual(visual, proj, gameTime) {
        const theme = getThemeById('storm');
        const g = visual.children[0] as Graphics;
        g.clear();
        const seed = stormSeedFromId(proj.id) + Math.floor(gameTime * FLICKER_HZ) * 104729;
        const r = proj.radius;

        // Two tail strands that cross over each other, so the tail never looks like one straight line.
        for (let strand = 0; strand < 2; strand++) {
            const len = TAIL_LENGTH * (0.75 + stormHash01(seed, strand) * 0.4);
            const spread = (stormHash01(seed, 10 + strand) * 2 - 1) * r * 1.2;
            drawLightningPath(g, 0, 0, -len, spread, {
                seed: seed + strand * 17,
                bends: 3,
                jitter: 0.25,
                maxJitterPx: 5,
                color: theme.secondaryNum,
                width: strand === 0 ? 1.6 : 1,
                alpha: strand === 0 ? 0.95 : 0.6,
            });
        }

        // Halo, glow and white-hot head; the glow pulses with the flicker.
        const pulse = 0.85 + stormHash01(seed, 99) * 0.3;
        g.circle(0, 0, r * 2.2 * pulse);
        g.fill({ color: theme.primaryNum, alpha: 0.25 });
        g.circle(0, 0, r * 1.35 * pulse);
        g.fill({ color: theme.secondaryNum, alpha: 0.85 });
        g.circle(0, 0, r * 0.7);
        g.fill({ color: 0xffffff, alpha: 1 });

        visual.rotation = Math.atan2(proj.velocityY, proj.velocityX);
    },
};
