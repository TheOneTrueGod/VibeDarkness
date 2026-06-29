/**
 * Imbued Bat — a light-infused version of Swing Bat, activated by the swap network
 * when Light Imbuement is cast.
 *
 * Inherits Swing Bat's perpendicular melee swing, then fires a secondary AoE
 * circle of light damage centered behind the primary target (in the direction
 * the attack came from, offset by the hitbox range). The swap network controls
 * whether this ability is visible and usable.
 *
 * Timings match Swing Bat:
 *   0.00–0.20  windup
 *   0.20–0.30  hit (primary swing + secondary light AoE)
 *   0.30–1.65  cooldown
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { perpendicularSwingHitbox } from '../../../hitboxes';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { DEFAULT_MELEE_LUNGE } from '../../../game/units/unit_defs/unitConstants';
import { LIGHT_IMBUE_BUFF_TYPE } from '../../../buffs/LightImbueBuff';
import { damageEnemiesInCircle } from '../../../abilities/targetHelpers';
import { Effect } from '../../../game/effects/Effect';
import { setupWindupLungePayload } from '../../../abilities/WindupLunge';
import { spawnRadiusScaledChargeUp, createChargeUpConfig } from '../../../abilities/meleeAnimationProfile';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import type { IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { ThickLineHitbox } from '../../../hitboxes';
import { renderMeleeTrackingHighlights } from '../../../abilities/targeting';

// ---- Constants ----

const CARD_ID = `${formatGroupId(AbilityGroupId.Light)}03`;

const BASE_MAX_RANGE = 25;
const SWING_LENGTH = 80;
const LINE_THICKNESS = 26;
const MAX_TARGETS = 3;
const SWING_BAT_ABILITY_ID = '0115';

const PRIMARY_DAMAGE = 10;

/** Light AoE cone behind the primary target. */
const LIGHT_AoE_RADIUS = 50;
const LIGHT_AoE_DAMAGE = 8;
/** Distance behind the target (opposite of attack direction) where the AoE is centered. */
const LIGHT_AoE_BEHIND_OFFSET = 20;

const SWING_EFFECT_DURATION = 0.4;

// ---- Hitbox (same as Swing Bat) ----

const IMBUED_BAT_HITBOX = perpendicularSwingHitbox(BASE_MAX_RANGE, SWING_LENGTH, LINE_THICKNESS, MAX_TARGETS);

// ---- Animation profile ----

const IMBUED_BAT_PROFILE = {
    chargeUp: createChargeUpConfig('high', {
        startTime: 0.04,
        endTime: 0.1,
        radius: 16,
        color: 0xffe066,
    }),
};

// ---- Image ----

const IMBUED_BAT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="imbuedGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#ffe066" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#ff9900" stop-opacity="0.0"/>
    </radialGradient>
  </defs>
  <ellipse cx="32" cy="32" rx="28" ry="16" fill="url(#imbuedGlow)" opacity="0.7"/>
  <rect x="10" y="28" width="44" height="12" rx="3" fill="#6b6b7a" stroke="#ffe066" stroke-width="2"/>
  <rect x="28" y="8" width="8" height="24" rx="2" fill="#7c7c8c" stroke="#ffe066" stroke-width="1.5"/>
  <rect x="10" y="28" width="20" height="12" rx="3" fill="#5a5a68" opacity="0.6"/>
  <circle cx="52" cy="34" r="5" fill="#ffe066" stroke="#ff9900" stroke-width="1.5"/>
</svg>`;

// ---- Behaviour ----

const imbuedBatBehaviour = CastBehaviours.MeleeAttack()
    .withHitbox(IMBUED_BAT_HITBOX)
    .withSlide({ forwardDistance: 18, backwardDistance: 0 })
    .withImpactVFX((ctx, hitUnits, aimX, aimY) => {
        // Primary swing visual (matches Swing Bat)
        const ep = IMBUED_BAT_HITBOX.getEndpoints(ctx.caster, aimX, aimY);
        ctx.engine.addEffect(new Effect({
            x: ep.rightX,
            y: ep.rightY,
            startX: ep.leftX,
            startY: ep.leftY,
            duration: SWING_EFFECT_DURATION,
            effectType: 'punch',
        }));

        // Secondary light AoE centered behind the primary target
        const dx = aimX - ctx.caster.x;
        const dy = aimY - ctx.caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const dirX = dist > 0 ? dx / dist : 1;
        const dirY = dist > 0 ? dy / dist : 0;

        // "Behind" = away from caster, past the aim point
        const behindX = aimX + dirX * LIGHT_AoE_BEHIND_OFFSET;
        const behindY = aimY + dirY * LIGHT_AoE_BEHIND_OFFSET;

        // Light burst VFX at the AoE center
        ctx.engine.addEffect(new Effect({
            x: behindX,
            y: behindY,
            duration: 0.35,
            effectType: 'LightBurst',
        }));

        // Apply light damage to enemies in the AoE (includes primary target if in range)
        if (hitUnits.length > 0) {
            damageEnemiesInCircle({
                engine: ctx.engine,
                caster: ctx.caster,
                center: { x: behindX, y: behindY },
                radius: LIGHT_AoE_RADIUS,
                damage: LIGHT_AoE_DAMAGE,
                abilityId: CARD_ID,
                attackType: 'ranged',
            });
        }
    })
    .withDamage(PRIMARY_DAMAGE)
    .withKnockback(3);

// ---- Ability export ----

export const ImbuedBatAbility = defineAbility({
    id: CARD_ID,
    name: 'Imbued Bat',
    image: IMBUED_BAT_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: 1,
    recoveries: [],
    prefireTime: 0.2,
    abilityTimings: [
        { id: 'windup',   start: 0,   end: 0.2,  abilityPhase: AbilityPhase.Windup },
        {
            id: 'hit',
            start: 0.2,
            end: 0.3,
            abilityPhase: AbilityPhase.Active,
            targetDef: { kind: 'select', label: 'Target', hitbox: IMBUED_BAT_HITBOX, filter: 'enemy', allowMiss: true },
            behaviour: imbuedBatBehaviour,
        },
        { id: 'cooldown', start: 0.3, end: 1.65, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [],
    lunge: { distance: DEFAULT_MELEE_LUNGE },
    aiSettings: { minRange: 0, maxRange: IMBUED_BAT_HITBOX.maxRange + DEFAULT_MELEE_LUNGE },

    swapConfig: {
        activateTrigger: { type: 'buffApplied', buffType: LIGHT_IMBUE_BUFF_TYPE },
        replacesAbilityId: SWING_BAT_ABILITY_ID,
        usesOnActivation: 1,
        deactivateTrigger: { type: 'selfExhausted' },
    },

    beginActiveCast(engine: unknown, caster: Unit, targets: ResolvedTarget[], active: ActiveAbility): void {
        setupWindupLungePayload(engine, caster, targets, active, { distance: DEFAULT_MELEE_LUNGE }, IMBUED_BAT_HITBOX.maxRange);
        spawnRadiusScaledChargeUp(engine as { addEffect(effect: Effect): void }, caster, IMBUED_BAT_PROFILE);
    },

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        units: Unit[],
    ): void {
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const aimDirX = dist > 0 ? dx / dist : 1;
        const aimDirY = dist > 0 ? dy / dist : 0;
        const clampedDist = Math.min(IMBUED_BAT_HITBOX.maxRange, dist || IMBUED_BAT_HITBOX.maxRange);
        const centerX = caster.x + aimDirX * clampedDist;
        const centerY = caster.y + aimDirY * clampedDist;
        const half = SWING_LENGTH / 2;
        const perpX = -aimDirY * half;
        const perpY = aimDirX * half;
        const leftX = centerX - perpX;
        const leftY = centerY - perpY;
        const rightX = centerX + perpX;
        const rightY = centerY + perpY;
        const halfThick = LINE_THICKNESS / 2;
        const offX = aimDirX * halfThick;
        const offY = aimDirY * halfThick;

        gr.clear();

        // Draw primary swing area (gold tint for imbued feel)
        gr.moveTo(leftX + offX, leftY + offY);
        gr.lineTo(leftX - offX, leftY - offY);
        gr.lineTo(rightX - offX, rightY - offY);
        gr.lineTo(rightX + offX, rightY + offY);
        gr.lineTo(leftX + offX, leftY + offY);
        gr.fill({ color: 0xffe066, alpha: 0.3 });
        gr.stroke({ color: 0xffd700, width: 2, alpha: 0.85 });

        // Draw secondary AoE circle (behind target)
        const behindX = centerX + aimDirX * LIGHT_AoE_BEHIND_OFFSET;
        const behindY = centerY + aimDirY * LIGHT_AoE_BEHIND_OFFSET;
        gr.circle(behindX, behindY, LIGHT_AoE_RADIUS);
        gr.fill({ color: 0xffe066, alpha: 0.15 });
        gr.stroke({ color: 0xffd700, width: 1, alpha: 0.5 });

        const ctx = { units, getUnit: (id: string) => units.find((u) => u.id === id) };
        const hits = ThickLineHitbox.getUnitsInHitbox(ctx, caster, leftX, leftY, rightX, rightY, LINE_THICKNESS);
        if (hits.length > 0) {
            hits.sort((a, b) => {
                const da = (a.x - mouseWorld.x) ** 2 + (a.y - mouseWorld.y) ** 2;
                const db = (b.x - mouseWorld.x) ** 2 + (b.y - mouseWorld.y) ** 2;
                return da - db;
            });
            renderMeleeTrackingHighlights(gr, hits.slice(0, MAX_TARGETS));
        }
    },

    getTooltipText(): string[] {
        return [
            `Swing your light-imbued bat dealing {${PRIMARY_DAMAGE}} damage to up to ${MAX_TARGETS} enemies.`,
            `{knockback 3}.`,
            `Releases a burst of light energy behind the target, dealing {${LIGHT_AoE_DAMAGE}} light damage to nearby enemies.`,
            `Granted for one use by {Light Imbuement}.`,
        ];
    },
});
