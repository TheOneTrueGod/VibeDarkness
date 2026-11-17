/**
 * `fusedBody` component: a small unit on a timer. It has health like any unit and a fuse; when the fuse runs out it
 * fires an effect (the burst) and leaves the field, and if it is killed first it fires a different effect (the
 * fizzle, usually nothing but a puff). State only; hooks and effect handlers live in `fusedBodyHooks.ts`.
 *
 * Why a component and not a CastBehaviour: the body is a unit the party can target and kill, so it lives for several
 * ticks, serializes with the unit and must still tick if its caster dies. A CastBehaviour is the right place to LOB
 * one (spawn it); the component owns what it does after landing.
 *
 * Declare on a def with
 * `components: [componentSpec(FUSED_BODY_COMPONENT, { fuseSeconds: 5, radiusPx: 96, onExpiry: {...}, onDeath: {...} })]`.
 * A def declares only data: effects are named (`effectId`) and resolved from a registry at runtime, so the options are
 * plain, serializable and never close over a unit.
 *
 * Clock: the fuse counts WORLD seconds (`ctx.dt` of the component tick), so it pauses with a Time Stop or world slow
 * like every other world timer, and ignores the body's own tempo.
 *
 * Telegraph window: the last `telegraphSeconds` (default 1.5) of the fuse. Everything that wants to read it (the
 * renderer's red ring, a Reactable reaction frame) uses `getFusedBodyStatus` / `fusedBodyTelegraphArea`, and the
 * `fused_body_telegraph_started` event fires once on the tick the window opens (that tick is the reaction frame).
 */

import type { VisualEffectDef } from '../../effects/visualEffectDef';
import type { Unit } from '../Unit';
import { defineUnitComponent, findComponentState, getComponentOptions } from './unitComponent';

/** Last this-many seconds of the fuse are the telegraph (the red warning). */
export const FUSED_BODY_TELEGRAPH_SECONDS = 1.5;

/** How a fused body ended. `null` while the fuse is still running. */
export type FusedBodyOutcome = 'expired' | 'killed';

/** A named effect plus its numeric parameters and optional visuals. Resolved by `fusedBodyHooks.ts`. */
export interface FusedBodyEffectSpec {
    /** Registered effect id (`areaDamage`, `none`, or one added with `registerFusedBodyEffect`). */
    effectId: string;
    /** Numeric parameters for the handler (for `areaDamage`: `damage`). */
    params?: Readonly<Record<string, number>>;
    /** Render-only visuals played at the body when the effect fires. */
    visuals?: readonly VisualEffectDef[];
}

export interface FusedBodyOptions {
    /** World seconds from spawn to burst. */
    fuseSeconds: number;
    /** Length of the telegraph window at the end of the fuse. Default `FUSED_BODY_TELEGRAPH_SECONDS`. */
    telegraphSeconds?: number;
    /** Reach of the burst around the body. Also the telegraph area (what a reaction frame checks players against). */
    radiusPx: number;
    /**
     * Reactable: when the telegraph window opens, players who know Reactions and stand in the burst get a
     * reaction frame (`requestReactionFrame`, wired in `engineEventWiring`).
     */
    reactable?: boolean;
    /** Colour of the blast circle the renderer draws during the telegraph window. Default red. */
    telegraphColor?: number;
    /** Fired when the fuse runs out. */
    onExpiry: FusedBodyEffectSpec;
    /** Fired when the body is killed before the fuse runs out. */
    onDeath: FusedBodyEffectSpec;
}

export interface FusedBodyState {
    /** World seconds left on the fuse; `null` until the first tick (treated as a full fuse). */
    remaining: number | null;
    /** The telegraph window has opened (the start event fired). */
    telegraphed: boolean;
    outcome: FusedBodyOutcome | null;
}

export const FUSED_BODY_COMPONENT = defineUnitComponent<FusedBodyState, FusedBodyOptions>({
    id: 'fusedBody',
    create: () => ({ remaining: null, telegraphed: false, outcome: null }),
    toJSON: (state) => ({
        ...(state.remaining !== null ? { fusedBodyRemaining: state.remaining } : {}),
        ...(state.telegraphed ? { fusedBodyTelegraphed: true } : {}),
        ...(state.outcome !== null ? { fusedBodyOutcome: state.outcome } : {}),
    }),
    fromJSON: (state, data) => {
        state.remaining = typeof data.fusedBodyRemaining === 'number' ? data.fusedBodyRemaining : null;
        state.telegraphed = data.fusedBodyTelegraphed === true;
        state.outcome =
            data.fusedBodyOutcome === 'expired' || data.fusedBodyOutcome === 'killed' ? data.fusedBodyOutcome : null;
    },
});

export function peekFusedBodyState(unit: Unit): FusedBodyState | undefined {
    return findComponentState(unit, FUSED_BODY_COMPONENT);
}

export function fusedBodyOptionsOf(unit: Unit): FusedBodyOptions | undefined {
    return getComponentOptions(unit, FUSED_BODY_COMPONENT);
}

export function fusedBodyTelegraphSeconds(options: FusedBodyOptions): number {
    return Math.min(options.fuseSeconds, options.telegraphSeconds ?? FUSED_BODY_TELEGRAPH_SECONDS);
}

/** Read-only view of a fused body's fuse, for renderers, AI and reaction frames. */
export interface FusedBodyStatus {
    fuseSeconds: number;
    /** World seconds left on the fuse (full fuse before the first tick). */
    remaining: number;
    telegraphSeconds: number;
    /** The fuse is inside its last `telegraphSeconds` and the body has not resolved yet. */
    telegraphing: boolean;
    /** Seconds since the telegraph opened (0 outside it); `elapsedInTelegraph / telegraphSeconds` is the ring fill. */
    elapsedInTelegraph: number;
    /** Where the burst lands. */
    area: { x: number; y: number; radiusPx: number };
    outcome: FusedBodyOutcome | null;
}

/** The fuse status of a unit, or undefined if it carries no fused body. */
export function getFusedBodyStatus(unit: Unit): FusedBodyStatus | undefined {
    const state = peekFusedBodyState(unit);
    const options = fusedBodyOptionsOf(unit);
    if (!state || !options) return undefined;
    const remaining = state.remaining ?? options.fuseSeconds;
    const telegraphSeconds = fusedBodyTelegraphSeconds(options);
    const telegraphing = state.outcome === null && remaining <= telegraphSeconds;
    return {
        fuseSeconds: options.fuseSeconds,
        remaining,
        telegraphSeconds,
        telegraphing,
        elapsedInTelegraph: telegraphing ? telegraphSeconds - remaining : 0,
        area: { x: unit.x, y: unit.y, radiusPx: options.radiusPx },
        outcome: state.outcome,
    };
}

/** The burst area while the telegraph is showing, else undefined. A reaction frame checks players against this. */
export function fusedBodyTelegraphArea(unit: Unit): { x: number; y: number; radiusPx: number } | undefined {
    const status = getFusedBodyStatus(unit);
    return status?.telegraphing ? status.area : undefined;
}
