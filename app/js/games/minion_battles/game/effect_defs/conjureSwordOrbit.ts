/**
 * Where each conjured blade sits during Create Sword.
 * Progress 0 and 1 are on the caster. The middle of the cast is the widest orbit.
 */
import {
    CONJURE_SWORD_COUNT,
    CONJURE_SWORD_FADE_PORTION,
    CONJURE_SWORD_ORBIT_RADIUS,
    CONJURE_SWORD_ORBIT_TURNS,
    SWORD_CARD_TIP_OFFSET,
} from '../../card_defs/10_armory_core/armoryConstants';

export interface ConjureSwordPose {
    x: number;
    y: number;
    rotation: number;
    alpha: number;
}

export function conjureSwordPose(index: number, progress: number): ConjureSwordPose {
    const clamped = Math.min(1, Math.max(0, progress));
    const angle = clamped * CONJURE_SWORD_ORBIT_TURNS * Math.PI * 2
        + (index / CONJURE_SWORD_COUNT) * Math.PI * 2;
    const radius = Math.sin(clamped * Math.PI) * CONJURE_SWORD_ORBIT_RADIUS;
    return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        rotation: angle + SWORD_CARD_TIP_OFFSET,
        alpha: conjureSwordAlpha(clamped),
    };
}

function conjureSwordAlpha(progress: number): number {
    if (progress < CONJURE_SWORD_FADE_PORTION) return progress / CONJURE_SWORD_FADE_PORTION;
    const fadeOutStart = 1 - CONJURE_SWORD_FADE_PORTION;
    if (progress > fadeOutStart) return (1 - progress) / CONJURE_SWORD_FADE_PORTION;
    return 1;
}
