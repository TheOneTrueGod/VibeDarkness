/**
 * Gravity Locus — deploys a gravity field at a point that nudges nearby enemies.
 *
 * The cast itself is short (~1s); the field is carried by GravityLocusFieldBuff on the
 * caster and keeps pulsing for GRAVITY_LOCUS_FIELD_DURATION seconds after the cast.
 * Push mode repels enemies from the locus; Pull mode draws them inward (stopping at the center).
 * Uses non-interrupting nudges — enemy windups are unaffected.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { nullHitbox } from '../../../hitboxes';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { defineAbility } from '../../../abilities/defineAbility';
import type { Unit } from '../../../game/units/Unit';
import type { ResolvedTarget, ActiveAbility } from '../../../game/types';
import type { EngineContext } from '../../../game/EngineContext';
import { GravityLocusFieldBuff, type GravityLocusRepulseConfig } from '../../../buffs/GravityLocusFieldBuff';
import {
    GRAVITY_ABILITY_MODE_PULL,
    GRAVITY_ABILITY_MODE_PUSH,
    GRAVITY_LOCUS_CAST_ACTIVE_DURATION,
    GRAVITY_LOCUS_COOLDOWN_DURATION,
    GRAVITY_LOCUS_FIELD_DURATION,
    GRAVITY_LOCUS_FIELD_RADIUS,
    GRAVITY_LOCUS_GRAVITY_COST,
    GRAVITY_LOCUS_MAX_RANGE,
    GRAVITY_LOCUS_PREFIRE_TIME,
} from '../gravityConstants';
import { GRAVITY_VIOLET } from '../../../game/effect_defs/aoeEffects';
import { getAbilityModifier } from '../../../abilities/abilityModifierHelpers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Gravity)}01`;
const MAX_USES = 1;

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
        defaultMode: GRAVITY_ABILITY_MODE_PULL,
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
            end: GRAVITY_LOCUS_PREFIRE_TIME + GRAVITY_LOCUS_CAST_ACTIVE_DURATION,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            targetDef: {
                kind: 'select',
                label: 'Locus',
                hitbox: nullHitbox,
                filter: 'any',
                allowMiss: true,
            },
        },
        {
            id: 'cooldown',
            start: GRAVITY_LOCUS_PREFIRE_TIME + GRAVITY_LOCUS_CAST_ACTIVE_DURATION,
            end: GRAVITY_LOCUS_PREFIRE_TIME + GRAVITY_LOCUS_CAST_ACTIVE_DURATION + GRAVITY_LOCUS_COOLDOWN_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [],
    clearMovementOnComplete: true,
    aiSettings: { minRange: 0, maxRange: GRAVITY_LOCUS_MAX_RANGE },

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: GRAVITY_LOCUS_MAX_RANGE };
    },

    getTooltipText(gameState?: unknown): string[] {
        const mod = getAbilityModifier(gameState, undefined, CARD_ID);
        const duration = GRAVITY_LOCUS_FIELD_DURATION * (mod.durationMult ?? 1);
        const lines = [
            `Deploy a gravity field for ${duration}s, nudging enemies within {${GRAVITY_LOCUS_FIELD_RADIUS}} each pulse.`,
            'Pull draws inward; Push repels from the locus.',
        ];
        if (mod.addTags?.includes('GravityRepulse')) {
            lines.push(
                `Repulse: the field collapses into a shrinking ring, then detonates on expiry — {${mod.explosionDamageFlat ?? 0}} damage and a knockback to enemies still caught inside.`,
            );
        }
        return lines;
    },

    doCardEffect(
        engine: unknown,
        caster: Unit,
        targets: ResolvedTarget[],
        prevTime: number,
        currentTime: number,
        active?: ActiveAbility,
    ): void {
        // One-shot at the end of windup: deploy the field. The buff carries the
        // pulses and field visual for GRAVITY_LOCUS_FIELD_DURATION, outliving the cast.
        const deployTime = GRAVITY_LOCUS_PREFIRE_TIME;
        if (currentTime < deployTime || prevTime >= deployTime) return;

        const locus = getPixelTargetPosition(targets, 0);
        if (!locus) return;

        const ctx = engine as EngineContext;
        const mod = caster.abilityModifiers[CARD_ID] ?? {};
        const duration = GRAVITY_LOCUS_FIELD_DURATION * (mod.durationMult ?? 1);
        const repulse: GravityLocusRepulseConfig | undefined = mod.addTags?.includes('GravityRepulse')
            ? { explosionDamage: mod.explosionDamageFlat ?? 0, knockbackTier: mod.knockbackTier ?? 1 }
            : undefined;

        caster.addBuff(
            new GravityLocusFieldBuff(locus, active?.abilityMode ?? GRAVITY_ABILITY_MODE_PULL, duration, repulse),
            ctx.gameTime,
            ctx.roundNumber,
            ctx.eventBus,
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
