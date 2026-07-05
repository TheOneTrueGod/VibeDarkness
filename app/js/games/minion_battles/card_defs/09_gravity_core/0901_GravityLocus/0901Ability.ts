/**
 * Gravity Locus — sustained gravity field at a point that nudges nearby enemies.
 *
 * Push mode repels enemies from the locus; Pull mode draws them inward (stopping at the center).
 * Uses non-interrupting nudges — enemy windups are unaffected.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { nullHitbox } from '../../../hitboxes';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { defineAbility } from '../../../abilities/defineAbility';
import { areEnemies } from '../../../game/teams';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget, ActiveAbility } from '../../../game/types';
import type { EngineContext } from '../../../game/EngineContext';
import { applyNudgeToUnit, clampNudgeVectorToTerrain } from '../../../game/units/unitNudge';
import { Effect } from '../../../game/effects/Effect';
import {
    GRAVITY_ABILITY_MODE_PULL,
    GRAVITY_ABILITY_MODE_PUSH,
    GRAVITY_LOCUS_ACTIVE_DURATION,
    GRAVITY_LOCUS_FIELD_RADIUS,
    GRAVITY_LOCUS_FIELD_ALPHA,
    GRAVITY_LOCUS_GRAVITY_COST,
    GRAVITY_LOCUS_MAX_RANGE,
    GRAVITY_LOCUS_NUDGE_DISTANCE,
    GRAVITY_LOCUS_NUDGE_DURATION,
    GRAVITY_LOCUS_PREFIRE_TIME,
    GRAVITY_LOCUS_PULSE_INTERVAL,
} from '../gravityConstants';
import {
    GRAVITY_FIELD_EFFECT_TYPE,
    GRAVITY_VIOLET,
} from '../../../game/effect_defs/aoeEffects';
import { NUDGE_ARROW_EFFECT_TYPE } from '../../../game/effect_defs/movementEffects';

const CARD_ID = `${formatGroupId(AbilityGroupId.Gravity)}01`;
const MAX_USES = 2;
const COOLDOWN_DURATION = 1.2;

const GRAVITY_LOCUS_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="locusCore" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#c084fc"/>
      <stop offset="50%" stop-color="#a855f7"/>
      <stop offset="100%" stop-color="#6b21a8" stop-opacity="0.0"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="26" fill="url(#locusCore)" opacity="0.9"/>
  <circle cx="32" cy="32" r="10" fill="#1e1033" opacity="0.85"/>
  <circle cx="32" cy="32" r="4" fill="#a855f7"/>
</svg>`;

function getPixelTargetPosition(
    targets: ResolvedTarget[],
    index: number = 0,
): { x: number; y: number } | null {
    const target = targets[index];
    if (!target || target.type !== 'pixel' || !target.position) return null;
    return target.position;
}

function getCompletedPulseCount(prevTime: number, currentTime: number): number {
    const activeStart = GRAVITY_LOCUS_PREFIRE_TIME;
    const before = Math.floor(Math.max(0, prevTime - activeStart) / GRAVITY_LOCUS_PULSE_INTERVAL);
    const after = Math.floor(Math.max(0, currentTime - activeStart) / GRAVITY_LOCUS_PULSE_INTERVAL);
    return Math.max(0, after - before);
}

function resolveFieldDirection(abilityMode?: string): 'in' | 'out' {
    return abilityMode === GRAVITY_ABILITY_MODE_PULL ? 'in' : 'out';
}

function applyLocusPulse(
    engine: EngineContext,
    caster: Unit,
    locus: { x: number; y: number },
    abilityMode: string | undefined,
    pulseCount: number,
): void {
    const mode = abilityMode ?? GRAVITY_ABILITY_MODE_PUSH;
    const radiusSq = GRAVITY_LOCUS_FIELD_RADIUS * GRAVITY_LOCUS_FIELD_RADIUS;

    for (let p = 0; p < pulseCount; p++) {
        for (const target of engine.units) {
            if (!target.isAlive()) continue;
            if (!areEnemies(caster.teamId, target.teamId)) continue;

            const dx = target.x - locus.x;
            const dy = target.y - locus.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > radiusSq) continue;

            const dist = Math.sqrt(distSq);
            let nudgeX: number;
            let nudgeY: number;

            if (mode === GRAVITY_ABILITY_MODE_PULL) {
                if (dist < 1e-3) continue;
                const pullDist = Math.min(GRAVITY_LOCUS_NUDGE_DISTANCE, dist);
                nudgeX = -(dx / dist) * pullDist;
                nudgeY = -(dy / dist) * pullDist;
            } else {
                if (dist < 1e-3) {
                    nudgeX = GRAVITY_LOCUS_NUDGE_DISTANCE;
                    nudgeY = 0;
                } else {
                    nudgeX = (dx / dist) * GRAVITY_LOCUS_NUDGE_DISTANCE;
                    nudgeY = (dy / dist) * GRAVITY_LOCUS_NUDGE_DISTANCE;
                }
            }

            const clamped = clampNudgeVectorToTerrain(
                target,
                { x: nudgeX, y: nudgeY },
                engine.terrainManager,
                engine.terrainManager?.grid ?? null,
            );
            if (Math.hypot(clamped.x, clamped.y) < 0.5) continue;

            applyNudgeToUnit(
                target,
                clamped,
                GRAVITY_LOCUS_NUDGE_DURATION,
            );

            const angle = Math.atan2(clamped.y, clamped.x);
            engine.addEffect(new Effect({
                x: target.x,
                y: target.y,
                duration: GRAVITY_LOCUS_NUDGE_DURATION,
                effectType: NUDGE_ARROW_EFFECT_TYPE,
                effectData: { direction: angle, color: GRAVITY_VIOLET },
            }));
        }
    }
}

export const GravityLocusAbility = defineAbility({
    id: CARD_ID,
    name: 'Gravity Locus',
    image: GRAVITY_LOCUS_IMAGE,
    resourceCost: { resourceId: 'gravity', amount: GRAVITY_LOCUS_GRAVITY_COST },
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: [{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 }],
    prefireTime: GRAVITY_LOCUS_PREFIRE_TIME,
    abilityModes: {
        modes: [GRAVITY_ABILITY_MODE_PUSH, GRAVITY_ABILITY_MODE_PULL],
        defaultMode: GRAVITY_ABILITY_MODE_PUSH,
    },
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: GRAVITY_LOCUS_PREFIRE_TIME,
            abilityPhase: AbilityPhase.Windup,
        },
        {
            id: 'active',
            start: GRAVITY_LOCUS_PREFIRE_TIME,
            end: GRAVITY_LOCUS_PREFIRE_TIME + GRAVITY_LOCUS_ACTIVE_DURATION,
            abilityPhase: AbilityPhase.Active,
            targetDef: {
                kind: 'select',
                label: 'Locus',
                hitbox: nullHitbox,
                filter: 'any',
                allowMiss: true,
            },
            emitterDef: {
                mode: 'continuous',
                effectType: GRAVITY_FIELD_EFFECT_TYPE,
                effectPosition: 'target',
                effectData: {
                    color: GRAVITY_VIOLET,
                    radius: GRAVITY_LOCUS_FIELD_RADIUS,
                    alpha: GRAVITY_LOCUS_FIELD_ALPHA,
                },
                resolveEffectData: ({ abilityMode }) => ({
                    direction: resolveFieldDirection(abilityMode),
                }),
            },
        },
        {
            id: 'cooldown',
            start: GRAVITY_LOCUS_PREFIRE_TIME + GRAVITY_LOCUS_ACTIVE_DURATION,
            end: GRAVITY_LOCUS_PREFIRE_TIME + GRAVITY_LOCUS_ACTIVE_DURATION + COOLDOWN_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [],
    clearMovementOnComplete: true,
    aiSettings: { minRange: 0, maxRange: GRAVITY_LOCUS_MAX_RANGE },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: GRAVITY_LOCUS_MAX_RANGE };
    },

    getTooltipText(): string[] {
        return [
            `Sustain a gravity field for ${GRAVITY_LOCUS_ACTIVE_DURATION}s, nudging enemies within {${GRAVITY_LOCUS_FIELD_RADIUS}} each pulse.`,
            'Push repels from the locus; Pull draws inward without overshooting.',
        ];
    },

    doCardEffect(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        prevTime: number,
        currentTime: number,
        active?: ActiveAbility,
    ): void {
        const activeStart = GRAVITY_LOCUS_PREFIRE_TIME;
        const activeEnd = activeStart + GRAVITY_LOCUS_ACTIVE_DURATION;
        if (currentTime < activeStart || prevTime >= activeEnd) return;

        const pulses = getCompletedPulseCount(prevTime, currentTime);
        if (pulses <= 0) return;

        const locus = getPixelTargetPosition(targets, 0);
        if (!locus) return;

        applyLocusPulse(
            engine as EngineContext,
            caster,
            locus,
            active?.abilityMode,
            pulses,
        );
    },

    renderTargetingPreviewSelectedTargets(gr, caster, _targets, mouseWorld): void {
        gr.clear();
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.hypot(dx, dy);
        const scale = dist > GRAVITY_LOCUS_MAX_RANGE ? GRAVITY_LOCUS_MAX_RANGE / dist : 1;
        const tx = caster.x + dx * scale;
        const ty = caster.y + dy * scale;

        gr.moveTo(caster.x, caster.y);
        gr.lineTo(tx, ty);
        gr.stroke({ color: GRAVITY_VIOLET, alpha: 0.45, width: 1 });

        gr.circle(tx, ty, GRAVITY_LOCUS_FIELD_RADIUS);
        gr.stroke({ color: GRAVITY_VIOLET, alpha: 0.35, width: 2 });
    },
});

export const GravityLocusCard: CardDef = {
    abilityId: CARD_ID,
};
