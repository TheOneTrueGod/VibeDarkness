/**
 * Shared "blood mist" VFX helpers reused by all three Blood Mage abilities (Blood Mend 0301,
 * Burst 0302, Protect 0303) instead of bespoke one-offs per ability. See
 * `card_defs/03_blood_mage/AGENTS.md` for the visual-identity intent (black+red, always
 * blended/misty, never a stark split) these helpers exist to serve. Placement precedent:
 * `abilities/gatherLightHelpers.ts`.
 */

import { Effect } from '../game/effects/Effect';
import type { EngineContext } from '../game/EngineContext';
import type { Unit } from '../game/units/Unit';
import {
    BLOOD_MIST_BURST_EFFECT_TYPE,
    BLOOD_MIST_IMPACT_EFFECT_TYPE,
    BLOOD_MIST_RED,
} from '../game/effect_defs/bloodMageEffects';

export type BloodMistVariant = 'heal' | 'burst' | 'shield';

/** Per-variant accent tint layered over the shared black mist base (see the effect defs) —
 * keeps all three abilities visually related while still reading as distinct casts. */
const BLOOD_MIST_VARIANT_COLOR: Record<BloodMistVariant, number> = {
    heal: 0xb91c1c,
    burst: 0x991b1b,
    shield: 0x7f1d1d,
};

function variantColor(variant?: BloodMistVariant): number {
    return variant ? BLOOD_MIST_VARIANT_COLOR[variant] : BLOOD_MIST_RED;
}

export const BLOOD_MIST_WINDUP_DURATION = 0.5;
export const BLOOD_MIST_TRAVEL_DEFAULT_DURATION = 0.35;
export const BLOOD_MIST_IMPACT_DURATION = 0.3;

export interface BloodMistWindupOpts {
    /** Swirl radius; defaults to caster.radius + 14. */
    radius?: number;
    duration?: number;
    variant?: BloodMistVariant;
}

/** Mist swirl/burst at the caster during windup. */
export function spawnBloodMistWindupBurst(
    engine: EngineContext,
    caster: Unit,
    opts: BloodMistWindupOpts = {},
): void {
    engine.addEffect(new Effect({
        x: caster.x,
        y: caster.y,
        duration: opts.duration ?? BLOOD_MIST_WINDUP_DURATION,
        effectType: BLOOD_MIST_BURST_EFFECT_TYPE,
        effectRadius: opts.radius ?? caster.radius + 14,
        effectData: { color: variantColor(opts.variant) },
    }));
}

export interface BloodMistTravelOpts {
    /** How long the mist hangs at the origin before flying to the target (seconds). Combined
     * with `flightDuration`, callers should size this so the mist lands exactly on the
     * ability's active frame (e.g. hangTime = windup length - flightDuration). */
    hangTime?: number;
    /** Flight duration once it leaves the origin (seconds). */
    flightDuration?: number;
    radius?: number;
    variant?: BloodMistVariant;
}

/**
 * Mist that hangs briefly at `fromPos` then flies to `toPos`, timed via `Effect.delay` +
 * `duration` so it lands exactly on the active frame. A plain one-shot `Effect` (not
 * `StoryHomingParticleEmitter`) is deliberate — this is a straight-line flight timed against
 * the ability's own windup/active split, not a bezier homing particle.
 */
export function spawnBloodMistTravel(
    engine: EngineContext,
    fromPos: { x: number; y: number },
    toPos: { x: number; y: number },
    opts: BloodMistTravelOpts = {},
): void {
    engine.addEffect(new Effect({
        // Effect travels from (startX, startY) to (x, y) over `duration`, starting after `delay`.
        x: toPos.x,
        y: toPos.y,
        startX: fromPos.x,
        startY: fromPos.y,
        delay: opts.hangTime ?? 0,
        duration: opts.flightDuration ?? BLOOD_MIST_TRAVEL_DEFAULT_DURATION,
        effectType: BLOOD_MIST_BURST_EFFECT_TYPE,
        effectRadius: opts.radius ?? 10,
        effectData: { color: variantColor(opts.variant) },
    }));
}

export interface BloodMistImpactOpts {
    variant: BloodMistVariant;
    radius?: number;
    duration?: number;
}

/** Themed landing flash at `point`; `variant` selects the accent tint (heal/burst/shield). */
export function spawnBloodMistImpactFlash(
    engine: EngineContext,
    point: { x: number; y: number },
    opts: BloodMistImpactOpts,
): void {
    engine.addEffect(new Effect({
        x: point.x,
        y: point.y,
        duration: opts.duration ?? BLOOD_MIST_IMPACT_DURATION,
        effectType: BLOOD_MIST_IMPACT_EFFECT_TYPE,
        effectRadius: opts.radius ?? 18,
        effectData: { variant: opts.variant, color: variantColor(opts.variant) },
    }));
}
