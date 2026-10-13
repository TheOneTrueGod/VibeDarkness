import { Container, Graphics } from 'pixi.js';
import type { Effect } from '../effects/Effect';
import type { IAbilityPreviewGraphics } from '../../abilities/Ability';
import type { IEffectDef, IEffectRenderContext } from './types';
import { GRAVITY_VIOLET } from './aoeEffects';

/**
 * Reusable "gather" visuals (used by Gravity: Collapse). None of these touch the camera.
 * - ConeCollapse: wedge shockwave converging on the caster.
 * - TetherRibbon: ribbon between two world points that snaps taut.
 * - FlingTrail: violet streak behind a unit flung from `from` to `to` (stateless; no unit lookup).
 * - drawConvergeStreams: windup particle streams drawn from a cone's far edge toward its apex.
 * Arrival ring + dust are NOT new defs: spawn `HowlShockwave` (small `scale`, violet `colors`) and
 * `TerrainImpact` (`impact` = world point, no `tile`) at the landing slot.
 */

export const CONE_COLLAPSE_EFFECT_TYPE = 'ConeCollapse';
export const TETHER_RIBBON_EFFECT_TYPE = 'TetherRibbon';
export const FLING_TRAIL_EFFECT_TYPE = 'FlingTrail';

/** Effect is positioned at the cone apex (caster). Angles in radians, lengths in world px. */
export interface ConeCollapseEffectData {
    color?: number;
    /** Cone length in px. */
    length?: number;
    /** Total cone width in degrees. */
    widthDeg?: number;
    /** Aim direction in radians (world space). */
    direction?: number;
}

/** Effect `x`/`y` should be the `from` point; `from`/`to` are absolute world coordinates. */
export interface TetherRibbonEffectData {
    color?: number;
    from?: { x: number; y: number };
    to?: { x: number; y: number };
}

export const coneCollapseEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = (effect.effectData ?? {}) as ConeCollapseEffectData;
        const color = data.color ?? GRAVITY_VIOLET;
        const length = data.length ?? 110;
        const halfArc = (((data.widthDeg ?? 70) * Math.PI) / 180) / 2;
        const dir = data.direction ?? 0;
        const p = effect.progress;

        // Leading edge sweeps from the far end back to the caster; a trailing band follows it.
        const outerR = length * (1 - p);
        const innerR = Math.max(0, outerR - length * 0.35);
        if (outerR <= 1) return;
        const bodyAlpha = Math.max(0, 0.5 * (1 - p * 0.6));
        const segments = 20;
        const start = dir - halfArc;
        const arc = halfArc * 2;
        g.moveTo(innerR * Math.cos(start), innerR * Math.sin(start));
        for (let i = 0; i <= segments; i++) {
            const a = start + (i / segments) * arc;
            g.lineTo(outerR * Math.cos(a), outerR * Math.sin(a));
        }
        for (let i = segments; i >= 0; i--) {
            const a = start + (i / segments) * arc;
            g.lineTo(innerR * Math.cos(a), innerR * Math.sin(a));
        }
        g.fill({ color, alpha: bodyAlpha * 0.5 });
        // Leading arc edge
        for (let i = 0; i <= segments; i++) {
            const a = start + (i / segments) * arc;
            const x = outerR * Math.cos(a);
            const y = outerR * Math.sin(a);
            if (i === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
        }
        g.stroke({ color, width: 2, alpha: bodyAlpha + 0.2 });
        // Edge rays converging on the apex
        for (const a of [start, start + arc]) {
            g.moveTo(0, 0);
            g.lineTo(outerR * Math.cos(a), outerR * Math.sin(a));
            g.stroke({ color, width: 1.5, alpha: bodyAlpha });
        }
    },
};

export const tetherRibbonEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = (effect.effectData ?? {}) as TetherRibbonEffectData;
        if (!data.from || !data.to) return;
        const color = data.color ?? GRAVITY_VIOLET;
        const p = effect.progress;
        const x0 = data.from.x - effect.x;
        const y0 = data.from.y - effect.y;
        const x1 = data.to.x - effect.x;
        const y1 = data.to.y - effect.y;
        const dx = x1 - x0;
        const dy = y1 - y0;
        const len = Math.hypot(dx, dy);
        if (len < 1) return;
        const nx = -dy / len;
        const ny = dx / len;

        // Slack sag decays to zero by ~60% of the duration (snaps taut), then the ribbon fades.
        const tautT = Math.min(1, p / 0.6);
        const sag = (1 - tautT * tautT) * Math.min(18, len * 0.25);
        const wobble = Math.sin(p * Math.PI * 6) * (1 - tautT) * 4;
        const cx = (x0 + x1) / 2 + nx * (sag + wobble);
        const cy = (y0 + y1) / 2 + ny * (sag + wobble);
        const alpha = Math.max(0, 0.85 * (1 - Math.max(0, p - 0.6) / 0.4));
        const width = 1.5 + tautT * 2;

        // Soft glow underlay, then core line.
        g.moveTo(x0, y0);
        g.quadraticCurveTo(cx, cy, x1, y1);
        g.stroke({ color, width: width + 4, alpha: alpha * 0.25 });
        g.moveTo(x0, y0);
        g.quadraticCurveTo(cx, cy, x1, y1);
        g.stroke({ color: 0xe9d5ff, width, alpha });
    },
};

/** Effect `x`/`y` should be the `from` point; `from`/`to` are absolute world coordinates. */
export interface FlingTrailEffectData {
    color?: number;
    from?: { x: number; y: number };
    to?: { x: number; y: number };
    /** Streak length as a fraction of the path (default 0.45). */
    tailFraction?: number;
}

/** Tapering streak that chases a flung unit's head along from -> to over the effect duration. */
export const flingTrailEffectDef: IEffectDef = {
    createVisual(_effect: Effect, _context: IEffectRenderContext): Graphics {
        return new Graphics();
    },
    updateVisual(visual: Container, effect: Effect, _context: IEffectRenderContext): void {
        const g = visual as Graphics;
        g.clear();
        const data = (effect.effectData ?? {}) as FlingTrailEffectData;
        if (!data.from || !data.to) return;
        const color = data.color ?? GRAVITY_VIOLET;
        const tail = data.tailFraction ?? 0.45;
        const dx = data.to.x - data.from.x;
        const dy = data.to.y - data.from.y;
        const ox = data.from.x - effect.x;
        const oy = data.from.y - effect.y;
        const p = effect.progress;
        const head = Math.min(1, p);
        const steps = 6;
        // Segments fade and thin toward the tail.
        for (let i = 0; i < steps; i++) {
            const a = Math.max(0, head - (tail * i) / steps);
            const b = Math.max(0, head - (tail * (i + 1)) / steps);
            const k = 1 - i / steps;
            g.moveTo(ox + dx * a, oy + dy * a);
            g.lineTo(ox + dx * b, oy + dy * b);
            g.stroke({ color: i === 0 ? 0xe9d5ff : color, width: 1 + 4 * k, alpha: 0.7 * k * (1 - p * 0.5) });
        }
    },
};

export interface ConvergeStreamsOptions {
    /** Apex in the graphics' coordinate space (default 0,0). */
    originX?: number;
    originY?: number;
    color?: number;
    /** Stream start distance from the apex, in px. */
    length: number;
    /** Total width of the fan in degrees. */
    widthDeg: number;
    /** Aim direction in radians. */
    direction: number;
    /** Number of streams. */
    count?: number;
    /** 0..1 progress through the windup. */
    progress: number;
    /** Seed for deterministic per-stream variation (e.g. a hash of the unit/ability id). */
    seed?: number;
}

/**
 * Faint streams that start at the cone's far edge and slide toward the apex as `progress` goes 0 -> 1.
 * Pure function of its arguments (no RNG, no state), so it is safe to call from a per-frame preview.
 */
export function drawConvergeStreams(gr: IAbilityPreviewGraphics, o: ConvergeStreamsOptions): void {
    const color = o.color ?? GRAVITY_VIOLET;
    const count = o.count ?? 7;
    const half = ((o.widthDeg * Math.PI) / 180) / 2;
    const seed = o.seed ?? 0;
    const ox = o.originX ?? 0;
    const oy = o.originY ?? 0;
    const p = Math.max(0, Math.min(1, o.progress));
    for (let i = 0; i < count; i++) {
        const frac = count === 1 ? 0.5 : i / (count - 1);
        const angle = o.direction - half + frac * half * 2;
        // Cheap deterministic jitter in [0,1) per stream.
        const jitter = Math.abs(Math.sin((i + 1) * 12.9898 + seed * 78.233)) % 1;
        const head = (1 - p) * (0.85 + 0.15 * jitter);
        const tailR = Math.min(1, head + 0.25 + 0.1 * jitter);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        gr.moveTo(ox + cos * o.length * tailR, oy + sin * o.length * tailR);
        gr.lineTo(ox + cos * o.length * head, oy + sin * o.length * head);
        gr.stroke({ color, width: 1.5, alpha: 0.15 + 0.3 * p });
    }
}
