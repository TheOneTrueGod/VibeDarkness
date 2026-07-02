import type { Unit } from '../game/units/Unit';
import { Effect } from '../game/effects/Effect';
import {
    CASTER_CHARGE_UP_EFFECT_TYPE,
    type CasterChargeUpEffectConfig,
} from '../game/effect_defs/casterChargeUpEffect';

export type { CasterChargeUpEffectConfig };

/** Default yellow charge-up profile: contracting rings then an outward fade burst. */
export function createDefaultCasterChargeUpConfig(
    casterRadius: number,
    overrides?: Partial<Omit<CasterChargeUpEffectConfig, 'casterRadius'>>,
): CasterChargeUpEffectConfig {
    return {
        casterRadius,
        ringCount: 4,
        color: 0xffe066,
        ringStartRadiusScale: 1.5,
        ringEndRadiusScale: 1.0,
        ringAlphaStart: 0.2,
        ringAlphaEnd: 0.5,
        burstStartRadiusScale: 1.0,
        burstEndRadiusScale: 1.2,
        burstAlphaStart: 0.3,
        burstAlphaEnd: 0.0,
        ringPhaseEnd: 0.88,
        ...overrides,
    };
}

export function spawnCasterChargeUpEffect(
    engine: { addEffect(effect: Effect): void },
    caster: Unit,
    durationSeconds: number,
    config?: Partial<Omit<CasterChargeUpEffectConfig, 'casterRadius'>>,
): void {
    const payload: CasterChargeUpEffectConfig = createDefaultCasterChargeUpConfig(caster.radius, config);
    engine.addEffect(new Effect({
        x: caster.x,
        y: caster.y,
        duration: Math.max(0.05, durationSeconds),
        effectType: CASTER_CHARGE_UP_EFFECT_TYPE,
        effectData: { config: payload },
    }));
}
