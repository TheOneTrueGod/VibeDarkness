/**
 * Buff visuals - render effects for each buff type on units.
 * Each buff type can have a custom visual; unknown buffs get a default indicator.
 */

import { Graphics } from 'pixi.js';
import type { Unit } from '../game/units/Unit';
import type { Buff } from './Buff';
import { STUNNED_BUFF_TYPE } from './StunnedBuff';
import { BLEED_BUFF_TYPE, BleedBuff } from './BleedBuff';
import { EXPOSED_BUFF_TYPE } from './ExposedBuff';
import { LIFTED_BUFF_TYPE } from './LiftedBuff';
import { GRAVITY_LOCUS_FIELD_BUFF_TYPE } from './GravityLocusFieldBuff';
import { SHIELD_BUFF_TYPE, ShieldBuff } from './ShieldBuff';
import { type ShieldShimmerFilter, tryCreateShieldShimmerFilter } from '../game/ShieldShimmerFilter';

/** Context passed when rendering a buff visual. */
export interface IBuffVisualContext {
    gameTime: number;
}

/** Renders a buff's visual into the given Graphics (in unit-local coordinates). */
export type BuffVisualRenderer = (
    g: Graphics,
    unit: Unit,
    buff: Buff,
    ctx: IBuffVisualContext,
) => void;

const registry: Record<string, BuffVisualRenderer> = {};

/** Default visual for buffs without a custom renderer: small colored dot above unit. */
const defaultBuffVisual: BuffVisualRenderer = (g, unit, _buff, _ctx) => {
    const y = -unit.radius - 6;
    g.circle(0, y, 3);
    g.fill({ color: 0x888888, alpha: 0.8 });
    g.stroke({ color: 0xaaaaaa, width: 1, alpha: 0.6 });
};

/** Draw a 5-pointed star centered at (cx, cy) with given outer radius, rotation in radians. */
function drawFivePointedStar(
    g: Graphics,
    cx: number,
    cy: number,
    outerRadius: number,
    rotationRad: number,
    fillColor: number,
    strokeColor: number,
): void {
    const innerRadius = outerRadius * 0.4;
    const points: number[] = [];
    for (let i = 0; i < 5; i++) {
        const outerAngle = (i * 2 * Math.PI) / 5 - Math.PI / 2 + rotationRad;
        points.push(cx + Math.cos(outerAngle) * outerRadius, cy + Math.sin(outerAngle) * outerRadius);
        const innerAngle = ((i + 0.5) * 2 * Math.PI) / 5 - Math.PI / 2 + rotationRad;
        points.push(cx + Math.cos(innerAngle) * innerRadius, cy + Math.sin(innerAngle) * innerRadius);
    }
    g.poly(points, true);
    g.fill({ color: fillColor, alpha: 0.95 });
    g.stroke({ color: strokeColor, width: 1, alpha: 1 });
}

/** Stunned: two small 5-pointed stars that orbit above the unit like in a cartoon. */
const stunnedBuffVisual: BuffVisualRenderer = (g, unit, _buff, ctx) => {
    const orbitCenterY = -unit.radius * 0.75; // 75% of radius above center
    const orbitRadius = unit.radius * 0.35;
    const starSize = Math.max(3, unit.radius * 0.2);

    // Cartoon-style spin: ~2.5 rad/s
    const spinSpeed = 2.5;
    const angle = ctx.gameTime * spinSpeed;

    // Star colors: yellow/gold for cartoon "seeing stars" effect
    const fillColor = 0xffdd44;
    const strokeColor = 0xcc9900;

    // Two stars on opposite sides of the orbit
    const star1Angle = angle;
    const star2Angle = angle + Math.PI;

    const x1 = Math.cos(star1Angle) * orbitRadius;
    const y1 = orbitCenterY + Math.sin(star1Angle) * orbitRadius;
    const x2 = Math.cos(star2Angle) * orbitRadius;
    const y2 = orbitCenterY + Math.sin(star2Angle) * orbitRadius;

    drawFivePointedStar(g, x1, y1, starSize, angle * 0.5, fillColor, strokeColor);
    drawFivePointedStar(g, x2, y2, starSize, angle * 0.5 + Math.PI / 2, fillColor, strokeColor);
};

/** Bleed: small red droplets above the unit; stack count scales dot size slightly. */
const bleedBuffVisual: BuffVisualRenderer = (g, unit, buff, _ctx) => {
    const bleed = buff as BleedBuff;
    const stacks = bleed.stacks;
    if (stacks <= 0) return;

    const baseY = -unit.radius - 4;
    const dropletCount = Math.min(5, stacks);
    const denom = dropletCount <= 1 ? 1 : dropletCount - 1;
    for (let i = 0; i < dropletCount; i++) {
        const t = i / denom;
        const spread = (t - 0.5) * (unit.radius * 0.5);
        const y = baseY - i * 3;
        const r = 2 + Math.min(2, stacks * 0.15);
        g.ellipse(spread, y, r, r * 1.2);
        g.fill({ color: 0xb91c1c, alpha: 0.9 });
        g.stroke({ color: 0x450a0a, width: 1, alpha: 0.85 });
    }
};

/**
 * Shield: a translucent shell around the unit's body, shimmering black/red/transparent.
 * See card_defs/03_blood_mage/AGENTS.md for the design intent behind Protect, which grants this.
 *
 * The filter is applied to the shared `buffEffects` Graphics (see UnitRenderer), so while a
 * shield is up, any other buff icons on the same unit are also rendered through the shimmer
 * shader — an accepted MVP tradeoff rather than giving every buff its own filtered layer.
 * One filter instance is cached per unit (not reallocated per frame); `uTime` is driven
 * directly from `ctx.gameTime` rather than accumulated per-frame deltas.
 */
const shieldShimmerFilters = new WeakMap<Unit, ShieldShimmerFilter>();

const shieldBuffVisual: BuffVisualRenderer = (g, unit, buff, ctx) => {
    const shield = buff as ShieldBuff;
    if (shield.remainingHp <= 0) return;

    let filter = shieldShimmerFilters.get(unit);
    if (filter === undefined) {
        filter = tryCreateShieldShimmerFilter() ?? undefined;
        if (filter) shieldShimmerFilters.set(unit, filter);
    }
    if (!filter) return; // shader unsupported on this GPU/driver — shield still functions mechanically, just no shimmer

    filter.time = ctx.gameTime;
    filter.shimmerAlpha = 0.4;

    const shellRadius = unit.radius + 3;
    g.circle(0, 0, shellRadius);
    g.fill({ color: 0xffffff, alpha: 0.9 });
    g.filters = [filter];
};

/** Register a buff visual renderer. */
export function registerBuffVisual(buffType: string, renderer: BuffVisualRenderer): void {
    registry[buffType] = renderer;
}

/** Get the visual renderer for a buff type. Returns default if none registered. */
export function getBuffVisualRenderer(buffType: string): BuffVisualRenderer {
    return registry[buffType] ?? defaultBuffVisual;
}

// Register built-in buff visuals
registerBuffVisual(STUNNED_BUFF_TYPE, stunnedBuffVisual);
registerBuffVisual(BLEED_BUFF_TYPE, bleedBuffVisual);
registerBuffVisual(EXPOSED_BUFF_TYPE, stunnedBuffVisual);
registerBuffVisual(LIFTED_BUFF_TYPE, (g, unit, _buff, _ctx) => {
    const y = -unit.radius - 8;
    g.moveTo(-4, y + 4);
    g.lineTo(0, y - 4);
    g.lineTo(4, y + 4);
    g.stroke({ color: 0xa855f7, width: 2, alpha: 0.85 });
});
// The field draws itself at the locus each tick; no marker on the caster.
registerBuffVisual(GRAVITY_LOCUS_FIELD_BUFF_TYPE, () => {});
registerBuffVisual(SHIELD_BUFF_TYPE, shieldBuffVisual);
