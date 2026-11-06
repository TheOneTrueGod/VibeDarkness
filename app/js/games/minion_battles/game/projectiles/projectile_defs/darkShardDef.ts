/**
 * Dark Shard: a splinter of the Court Magician's crystal, a long violet diamond with an orchid edge
 * and a faint glow, pointed along its flight and shimmering as it turns. Colours come from the Court
 * Magic theme (primary body, secondary edge). Used by Shard Nova (1402).
 */

import { Container, Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';
import { COURT_MAGIC_THEME } from '../../../themes/abilityThemes';
import { resolveAbilityTheme } from '../../../themes/abilityTheme';

export const DARK_SHARD_PROJECTILE_TYPE = 'dark_shard';

const THEME = resolveAbilityTheme(COURT_MAGIC_THEME);
const BODY = THEME.primaryNum;
const EDGE = THEME.secondaryNum;

export const darkShardDef: IProjectileDef = {
    createVisual(proj) {
        const root = new Container();
        const r = Math.max(3, proj.radius);
        const glow = new Graphics();
        glow.circle(0, 0, r * 1.8);
        glow.fill({ color: EDGE, alpha: 0.18 });
        root.addChild(glow);

        // Diamond pointing along +x (rotated to the velocity each frame).
        const shard = new Graphics();
        shard.poly([r * 2.2, 0, 0, -r * 0.9, -r * 1.4, 0, 0, r * 0.9], true);
        shard.fill({ color: BODY, alpha: 0.98 });
        shard.poly([r * 2.2, 0, 0, -r * 0.9, -r * 1.4, 0, 0, r * 0.9], true);
        shard.stroke({ color: EDGE, width: 1.5, alpha: 0.95 });
        // A bright facet line down the spine.
        shard.moveTo(-r * 0.8, 0);
        shard.lineTo(r * 1.8, 0);
        shard.stroke({ color: 0xffffff, width: 1, alpha: 0.55 });
        root.addChild(shard);
        return root;
    },
    updateVisual(visual, proj, gameTime) {
        visual.rotation = Math.atan2(proj.velocityY, proj.velocityX);
        const shimmer = (Math.sin(gameTime * 14 + proj.x * 0.05) + 1) / 2;
        const glow = (visual as Container).children[0];
        if (glow) glow.alpha = 0.6 + shimmer * 0.4;
        visual.scale.set(1, 0.85 + shimmer * 0.15);
    },
};
