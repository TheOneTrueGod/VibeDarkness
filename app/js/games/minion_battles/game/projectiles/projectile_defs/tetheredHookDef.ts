/**
 * Tethered hook: a barbed hook head trailing a chain back to the unit that threw it. Any projectile
 * that should read as still attached to its thrower (hooks, harpoons, grapples) can use
 * `TETHERED_HOOK_PROJECTILE_TYPE`. Pairs naturally with a `reelToSource` hit knockback.
 *
 * The chain is drawn in world-aligned local space from the projectile (0, 0) to the source unit's
 * current position, so it stays taut while the thrower moves. Purely visual: reads, never writes.
 */

import { Container, Graphics } from 'pixi.js';
import type { IProjectileDef } from './types';
import { drawChainLinks, IRON_CHAIN_STYLE } from '../../effect_defs/chainEffects';

export const TETHERED_HOOK_PROJECTILE_TYPE = 'tethered_hook';

const HOOK_COLOR = 0xd7dce2;
const HOOK_EDGE = 0x2a2d33;

function drawHookHead(g: Graphics): void {
    // Drawn pointing along +x; the container rotates it to the travel direction.
    g.clear();
    g.moveTo(-6, 0);
    g.lineTo(6, 0);
    g.stroke({ color: HOOK_EDGE, width: 4, alpha: 1 });
    g.moveTo(-6, 0);
    g.lineTo(6, 0);
    g.stroke({ color: HOOK_COLOR, width: 2, alpha: 1 });
    // Two curved barbs sweeping back from the tip.
    for (const side of [-1, 1]) {
        g.moveTo(6, 0);
        g.quadraticCurveTo(4, side * 7, -1, side * 6);
        g.stroke({ color: HOOK_EDGE, width: 3.5, alpha: 1 });
        g.moveTo(6, 0);
        g.quadraticCurveTo(4, side * 7, -1, side * 6);
        g.stroke({ color: HOOK_COLOR, width: 1.8, alpha: 1 });
    }
    g.circle(-6, 0, 2.2);
    g.fill({ color: IRON_CHAIN_STYLE.color, alpha: 1 });
}

export const tetheredHookDef: IProjectileDef = {
    createVisual() {
        const root = new Container();
        const chain = new Graphics();
        const head = new Graphics();
        drawHookHead(head);
        root.addChild(chain, head);
        return root;
    },
    updateVisual(visual, proj, _gameTime, getUnit) {
        // Children are added in createVisual as [chain, head].
        const chain = (visual.children[0] as Graphics | undefined) ?? null;
        const head = (visual.children[1] as Graphics | undefined) ?? null;
        if (head && (proj.velocityX !== 0 || proj.velocityY !== 0)) {
            head.rotation = Math.atan2(proj.velocityY, proj.velocityX);
        }
        if (!chain) return;
        const source = getUnit?.(proj.sourceUnitId);
        if (!source) {
            chain.clear();
            return;
        }
        chain.clear();
        drawChainLinks(chain, 0, 0, source.x - proj.x, source.y - proj.y);
    },
};
