import type { Unit } from '../game/units/Unit';
import { Effect } from '../game/effects/Effect';
import { DEFAULT_UNIT_RADIUS } from '../game/units/unit_defs/unitConstants';

export interface ChargeUpPulseConfig {
    startRadius: number;
    endRadius: number;
    width: number;
    color: number;
    startAt: number;
}

export interface ChargeUpVisualConfig {
    effectType: 'ChargeUpEffect';
    startTime: number;
    endTime: number;
    maxAlpha: number;
    pulses: ChargeUpPulseConfig[];
}

export interface MeleeAnimationProfile {
    chargeUp?: ChargeUpVisualConfig;
}

interface ChargeUpEffectPayload extends Record<string, unknown> {
    profile: ChargeUpVisualConfig;
}

export type ChargeUpIntensity = 'low' | 'medium' | 'high';

export function createChargeUpConfig(
    intensity: ChargeUpIntensity,
    args: {
        startTime: number;
        endTime: number;
        radius: number;
        color?: number;
    },
): ChargeUpVisualConfig {
    const baseColor = args.color ?? 0xd9b56d;
    const profileByIntensity: Record<ChargeUpIntensity, Omit<ChargeUpVisualConfig, 'effectType' | 'startTime' | 'endTime'>> = {
        low: {
            maxAlpha: 0.32,
            pulses: [
                {
                    startRadius: args.radius + 5,
                    endRadius: args.radius,
                    width: 2,
                    color: baseColor,
                    startAt: 0,
                },
            ],
        },
        medium: {
            maxAlpha: 0.4,
            pulses: [
                { startRadius: args.radius + 8, endRadius: args.radius, width: 2.5, color: baseColor, startAt: 0 },
                { startRadius: args.radius + 12, endRadius: args.radius + 1, width: 2, color: 0xf0cf87, startAt: 0.18 },
            ],
        },
        high: {
            maxAlpha: 0.48,
            pulses: [
                { startRadius: args.radius + 18, endRadius: args.radius + 2, width: 3.2, color: baseColor, startAt: 0 },
                { startRadius: args.radius + 14, endRadius: args.radius + 1, width: 2.8, color: 0xffd78a, startAt: 0.12 },
                { startRadius: args.radius + 10, endRadius: args.radius, width: 2.4, color: 0xfff1c0, startAt: 0.24 },
            ],
        },
    };
    const chosen = profileByIntensity[intensity];
    return {
        effectType: 'ChargeUpEffect',
        startTime: args.startTime,
        endTime: args.endTime,
        maxAlpha: chosen.maxAlpha,
        pulses: chosen.pulses,
    };
}

export function spawnMeleeChargeUpEffect(
    engine: { addEffect(effect: Effect): void },
    caster: Unit,
    profile: MeleeAnimationProfile,
): void {
    if (!profile.chargeUp) return;
    const duration = Math.max(0.01, profile.chargeUp.endTime - profile.chargeUp.startTime);
    const payload: ChargeUpEffectPayload = { profile: profile.chargeUp };
    engine.addEffect(new Effect({
        x: caster.x,
        y: caster.y,
        duration,
        effectType: profile.chargeUp.effectType,
        effectData: payload,
        delay: profile.chargeUp.startTime,
    }));
}

/**
 * Spawn the charge-up VFX for a melee cast, scaling pulse radii to match the caster's actual radius.
 * Replaces the copy-paste scaling pattern used across individual ability files.
 */
export function spawnRadiusScaledChargeUp(
    engine: { addEffect(effect: Effect): void },
    caster: Unit,
    profile: MeleeAnimationProfile,
): void {
    if (!profile.chargeUp) return;
    const radiusDelta = caster.radius - DEFAULT_UNIT_RADIUS;
    const chargeUp: ChargeUpVisualConfig = {
        ...profile.chargeUp,
        pulses: profile.chargeUp.pulses.map(p => ({
            ...p,
            startRadius: p.startRadius + radiusDelta,
            endRadius:   p.endRadius   + radiusDelta,
        })),
    };
    spawnMeleeChargeUpEffect(engine, caster, { ...profile, chargeUp });
}
