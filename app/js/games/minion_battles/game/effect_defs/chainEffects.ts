/**
 * Chains: a drawn run of iron links between two points, and the `ChainLink` effect that keeps a
 * chain stretched between two units while it lasts (reeling a hooked victim in, shackles, tethers).
 *
 * `ChainLink` effect: `effectData` is `ChainLinkEffectData` (`fromUnitId`, `toUnitId`). It follows
 * both units through `IEffectRenderContext.getUnitPosition`; when either is gone it draws nothing.
 * The last ~30% of its life the chain goes slack and fades. Purely visual.
 */

import { Graphics, type Container } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IEffectDef, IEffectRenderContext } from './types';

export const CHAIN_LINK_EFFECT_TYPE = 'ChainLink';

export interface ChainLinkEffectData {
    fromUnitId: string;
    toUnitId: string;
}

export interface ChainStyle {
    color: number;
    shade: number;
    alpha: number;
}

export const IRON_CHAIN_STYLE: ChainStyle = { color: 0x9aa1ab, shade: 0x3b3f46, alpha: 0.95 };

const LINK_SPACING_PX = 7;
const LINK_LONG_PX = 4.5;
const LINK_SHORT_PX = 2;

/**
 * Draw a chain from (x0, y0) to (x1, y1) in `g`'s local space. `sag` bows the middle sideways
 * (px, positive = left of travel) for slack chain. Does not clear `g`.
 */
export function drawChainLinks(
    g: Graphics,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    style: ChainStyle = IRON_CHAIN_STYLE,
    sag: number = 0,
): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 2) return;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const count = Math.max(1, Math.floor(len / LINK_SPACING_PX));
    const pointAt = (t: number) => {
        const bow = Math.sin(t * Math.PI) * sag;
        return { x: x0 + dx * t + nx * bow, y: y0 + dy * t + ny * bow };
    };

    // Shadow line under the links so the chain reads on light floors too.
    g.moveTo(x0, y0);
    for (let i = 1; i <= count; i++) {
        const p = pointAt(i / count);
        g.lineTo(p.x, p.y);
    }
    g.stroke({ color: style.shade, width: 3, alpha: style.alpha * 0.55 });

    for (let i = 1; i < count; i++) {
        const c = pointAt(i / count);
        // Alternate flat links (long along the chain) and edge-on links (short), like real chain.
        const along = i % 2 === 0 ? LINK_LONG_PX : LINK_SHORT_PX;
        const across = i % 2 === 0 ? LINK_SHORT_PX : LINK_LONG_PX * 0.6;
        g.moveTo(c.x - ux * along - nx * across, c.y - uy * along - ny * across);
        g.lineTo(c.x + ux * along - nx * across, c.y + uy * along - ny * across);
        g.lineTo(c.x + ux * along + nx * across, c.y + uy * along + ny * across);
        g.lineTo(c.x - ux * along + nx * across, c.y - uy * along + ny * across);
        g.closePath();
        g.stroke({ color: style.color, width: 1.5, alpha: style.alpha });
    }
}

/** Fraction of the effect's life after which the chain goes slack and fades. */
const SLACK_START = 0.7;

export const chainLinkEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = effect.effectData as Partial<ChainLinkEffectData>;
        if (!data.fromUnitId || !data.toUnitId || !context.getUnitPosition) return;
        const from = context.getUnitPosition(data.fromUnitId);
        const to = context.getUnitPosition(data.toUnitId);
        if (!from || !to) return;
        const p = effect.progress;
        const slackT = p < SLACK_START ? 0 : (p - SLACK_START) / (1 - SLACK_START);
        const style: ChainStyle = { ...IRON_CHAIN_STYLE, alpha: IRON_CHAIN_STYLE.alpha * (1 - slackT) };
        drawChainLinks(
            g,
            from.x - effect.x,
            from.y - effect.y,
            to.x - effect.x,
            to.y - effect.y,
            style,
            slackT * 10,
        );
    },
};
