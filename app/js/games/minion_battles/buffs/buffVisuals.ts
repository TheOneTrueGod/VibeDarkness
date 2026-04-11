/**
 * Buff visuals - render effects for each buff type on units.
 * Each buff type can have a custom visual; unknown buffs get a default indicator.
 */

import { Graphics } from 'pixi.js';
import type { Unit } from '../game/units/Unit';
import type { Buff } from './Buff';
import { STUNNED_BUFF_TYPE } from './StunnedBuff';

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
