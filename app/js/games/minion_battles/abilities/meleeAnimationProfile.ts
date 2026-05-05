import type { ActiveAbility } from '../game/types';
import type { Unit } from '../game/units/Unit';
import { Effect } from '../game/effects/Effect';
import { getDirectionFromTo } from './targetHelpers';

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

export interface MeleeSlideConfig {
    startTime: number;
    impactTime: number;
    backstepEndTime: number;
    forwardDistance: number;
    backwardDistance: number;
}

export interface MeleeAnimationProfile {
    slide: MeleeSlideConfig;
    chargeUp?: ChargeUpVisualConfig;
}

interface ChargeUpEffectPayload extends Record<string, unknown> {
    profile: ChargeUpVisualConfig;
}

export interface MeleeAnimationCastPayload {
    profile: MeleeAnimationProfile;
}

export type ChargeUpIntensity = 'low' | 'medium' | 'high';

function easeOutCubic(t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    return 1 - (1 - clamped) ** 3;
}

function easeInOutQuad(t: number): number {
    const clamped = Math.max(0, Math.min(1, t));
    return clamped < 0.5
        ? 2 * clamped * clamped
        : 1 - ((-2 * clamped + 2) ** 2) / 2;
}

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

export function getMeleeAnimationOffset(
    caster: Unit,
    active: ActiveAbility,
    gameTime: number,
    profile: MeleeAnimationProfile,
): { x: number; y: number } | null {
    const elapsed = gameTime - active.startTime;
    const slide = profile.slide;
    if (elapsed < slide.startTime || elapsed > slide.backstepEndTime) return null;

    const firstTarget = active.targets.find((target) => target.position != null);
    const targetPos = firstTarget?.position;
    if (!targetPos) return null;

    const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, targetPos.x, targetPos.y);
    if (dist <= 0) return null;

    if (elapsed <= slide.impactTime) {
        const t = (elapsed - slide.startTime) / Math.max(0.0001, slide.impactTime - slide.startTime);
        const forward = easeOutCubic(t) * slide.forwardDistance;
        return { x: dirX * forward, y: dirY * forward };
    }

    const tBack = (elapsed - slide.impactTime) / Math.max(0.0001, slide.backstepEndTime - slide.impactTime);
    const back = -easeInOutQuad(tBack) * slide.backwardDistance;
    return { x: dirX * back, y: dirY * back };
}

