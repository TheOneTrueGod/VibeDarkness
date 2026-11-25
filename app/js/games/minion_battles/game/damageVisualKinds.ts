/**
 * Presentation for each `DamageVisualKind`: the damage number colour and an optional impact effect at the
 * victim. A damage source opts in by passing `visualKind` to `takeDamage`; `createDamageTakenEffect` reads
 * this table. Add a kind here instead of branching in the effect code.
 */

import { DAMAGE_VISUAL_KIND_DARKNESS, DAMAGE_VISUAL_KIND_DAYLIGHT, type DamageVisualKind } from './EventBus';
import { DAYLIGHT_SEAR_EFFECT_TYPE } from './effect_defs/dayLightEffects';
import {
    DARKNESS_DAMAGE_NUMBER_COLOR,
    DARKNESS_RUPTURE_DURATION_SEC,
    DARKNESS_RUPTURE_EFFECT_TYPE,
} from './effect_defs/darknessRuptureEffects';
import { DAYLIGHT_DAMAGE_NUMBER_COLOR, DAYLIGHT_SEAR_DURATION_SEC } from './lighting/dayLightVfx';

export interface DamageVisualKindDef {
    /** Replaces the creature-type number colour. */
    numberColor: number;
    /** Effect spawned at the victim, sized to its radius. */
    impact?: { effectType: string; duration: number };
}

export const DAMAGE_VISUAL_KIND_DEFS: Record<DamageVisualKind, DamageVisualKindDef> = {
    [DAMAGE_VISUAL_KIND_DAYLIGHT]: {
        numberColor: DAYLIGHT_DAMAGE_NUMBER_COLOR,
        impact: { effectType: DAYLIGHT_SEAR_EFFECT_TYPE, duration: DAYLIGHT_SEAR_DURATION_SEC },
    },
    [DAMAGE_VISUAL_KIND_DARKNESS]: {
        numberColor: DARKNESS_DAMAGE_NUMBER_COLOR,
        impact: { effectType: DARKNESS_RUPTURE_EFFECT_TYPE, duration: DARKNESS_RUPTURE_DURATION_SEC },
    },
};
