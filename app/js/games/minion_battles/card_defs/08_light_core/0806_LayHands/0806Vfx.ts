/** Lay Hands juice: light motes drawn from the locked emitter, and a gold-white blast on detonation. */

import { Effect } from '../../../game/effects/Effect';
import { StoryHomingParticleEmitter } from '../../../game/effects/StoryHomingParticleEmitter';
import type { Unit } from '../../../game/units/Unit';
import {
    LAY_HANDS_COLOR,
    LAY_HANDS_COLOR_CORE,
    LAY_HANDS_EXPLOSION_RADIUS,
    LAY_HANDS_MOTE_COUNT,
    LAY_HANDS_MOTE_DURATION,
} from './0806Constants';

export interface LayHandsVfxEngine {
    addEffect(effect: Effect): void;
    addEffectEmitter(emitter: StoryHomingParticleEmitter): void;
}

/** Windup: a few gold motes arc from the emitter into the caster's fist. */
export function spawnLayHandsMotes(
    engine: LayHandsVfxEngine,
    caster: Unit,
    from: { x: number; y: number },
): void {
    const dx = caster.x - from.x;
    const dy = caster.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 0; i < LAY_HANDS_MOTE_COUNT; i++) {
        // Fan the arcs to alternating sides so the motes read as a stream, not a single dot.
        const side = i % 2 === 0 ? 1 : -1;
        const bend = Math.min(36, len * 0.3) * (1 + Math.floor(i / 2) * 0.5) * side;
        engine.addEffectEmitter(new StoryHomingParticleEmitter({
            x: from.x,
            y: from.y,
            startX: from.x,
            startY: from.y,
            controlX: (from.x + caster.x) / 2 + (-dy / len) * bend,
            controlY: (from.y + caster.y) / 2 + (dx / len) * bend,
            targetUnitId: caster.id,
            targetX: caster.x,
            targetY: caster.y,
            duration: LAY_HANDS_MOTE_DURATION + i * 0.03,
            tint: LAY_HANDS_COLOR,
            imageKey: 'glowOrb',
            pulseColors: [LAY_HANDS_COLOR, LAY_HANDS_COLOR_CORE],
        }));
    }
}

/** Detonation: white-hot core flash, expanding gold ring, and a soft gold fill. */
export function spawnLayHandsBlast(engine: LayHandsVfxEngine, at: { x: number; y: number }): void {
    const blast = (duration: number, radius: number, color: number, shape: 'disc' | 'ring') =>
        engine.addEffect(new Effect({
            x: at.x,
            y: at.y,
            duration,
            effectType: 'Explosion',
            effectRadius: radius,
            effectProperties: { radius, color, direction: 'expand', shape },
        }));
    blast(0.12, LAY_HANDS_EXPLOSION_RADIUS * 0.35, LAY_HANDS_COLOR_CORE, 'disc');
    blast(0.25, LAY_HANDS_EXPLOSION_RADIUS * 0.85, LAY_HANDS_COLOR, 'disc');
    blast(0.35, LAY_HANDS_EXPLOSION_RADIUS, LAY_HANDS_COLOR, 'ring');
}
