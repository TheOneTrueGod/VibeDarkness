/**
 * Imbued Bat — a light-infused version of Swing Bat, activated by the swap network
 * when Light Imbuement is cast.
 *
 * Inherits Swing Bat's perpendicular melee swing, then releases a forward cone of
 * light damage starting past the hammer centre (inner cut-off) out to LIGHT_CONE_MAX_RANGE.
 *
 * Timings match Swing Bat:
 *   0.00–0.20  windup
 *   0.20–0.30  hit (primary swing + secondary light cone)
 *   0.30–1.65  cooldown
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { perpendicularSwingHitbox } from '../../../hitboxes';
import { TruncatedConeHitboxSpec } from '../../../hitboxes/TruncatedConeHitbox';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { DEFAULT_MELEE_LUNGE } from '../../../game/units/unit_defs/unitConstants';
import { LIGHT_IMBUE_BUFF_TYPE } from '../../../buffs/LightImbueBuff';
import { Effect } from '../../../game/effects/Effect';
import { LIGHT_CONE_BURST_EFFECT_TYPE } from '../../../game/effect_defs/lightConeEffects';
import { setupWindupLungePayload } from '../../../abilities/WindupLunge';
import { spawnRadiusScaledChargeUp, createChargeUpConfig } from '../../../abilities/meleeAnimationProfile';
import { STANDARD_SHIELD_HALF_ARC_RAD } from '../../../abilities/shieldHelpers';
import { damageEnemiesInTruncatedCone } from '../../../abilities/targetHelpers';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
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

/** Forward light cone behind the hammer swing. */
export const LIGHT_CONE_MAX_RANGE = 200;
export const LIGHT_CONE_DAMAGE = 8;
const LIGHT_CONE_MAX_TARGETS = 5;
const LIGHT_CONE_HALF_ARC_RAD = STANDARD_SHIELD_HALF_ARC_RAD;
const LIGHT_CONE_EFFECT_DURATION = 0.35;

const SWING_EFFECT_DURATION = 0.4;

// ---- Hitboxes ----

const IMBUED_BAT_HITBOX = perpendicularSwingHitbox(BASE_MAX_RANGE, SWING_LENGTH, LINE_THICKNESS, MAX_TARGETS);

const IMBUED_BAT_LIGHT_CONE = new TruncatedConeHitboxSpec(
    LIGHT_CONE_MAX_RANGE,
    LIGHT_CONE_HALF_ARC_RAD,
    (caster, aimX, aimY) => {
        const ep = IMBUED_BAT_HITBOX.getEndpoints(caster, aimX, aimY);
        return Math.hypot(ep.centerX - caster.x, ep.centerY - caster.y);
    },
    LIGHT_CONE_MAX_TARGETS,
);

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
        const ep = IMBUED_BAT_HITBOX.getEndpoints(ctx.caster, aimX, aimY);
        ctx.engine.addEffect(new Effect({
            x: ep.rightX,
            y: ep.rightY,
            startX: ep.leftX,
            startY: ep.leftY,
            duration: SWING_EFFECT_DURATION,
            effectType: 'punch',
        }));

        if (hitUnits.length === 0) return;

        const cone = IMBUED_BAT_LIGHT_CONE.getGeometry(ctx.caster, aimX, aimY);
        ctx.engine.addEffect(new Effect({
            x: ctx.caster.x,
            y: ctx.caster.y,
            duration: LIGHT_CONE_EFFECT_DURATION,
            effectType: LIGHT_CONE_BURST_EFFECT_TYPE,
            effectData: {
                centerAngle: cone.centerAngle,
                halfArcRad: cone.halfArcRad,
                innerR: cone.minR,
                outerR: cone.maxR,
            },
        }));

        damageEnemiesInTruncatedCone({
            engine: ctx.engine,
            caster: ctx.caster,
            aimX,
            aimY,
            minR: cone.minR,
            maxR: cone.maxR,
            halfAngleRad: cone.halfArcRad,
            damage: LIGHT_CONE_DAMAGE,
            abilityId: CARD_ID,
            attackType: 'ranged',
            maxTargets: LIGHT_CONE_MAX_TARGETS,
        });
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
        const ep = IMBUED_BAT_HITBOX.getEndpoints(caster, mouseWorld.x, mouseWorld.y);
        const half = LINE_THICKNESS / 2;
        const offX = ep.aimDirX * half;
        const offY = ep.aimDirY * half;

        gr.clear();

        gr.moveTo(ep.leftX + offX, ep.leftY + offY);
        gr.lineTo(ep.leftX - offX, ep.leftY - offY);
        gr.lineTo(ep.rightX - offX, ep.rightY - offY);
        gr.lineTo(ep.rightX + offX, ep.rightY + offY);
        gr.lineTo(ep.leftX + offX, ep.leftY + offY);
        gr.fill({ color: 0xffe066, alpha: 0.3 });
        gr.stroke({ color: 0xffd700, width: 2, alpha: 0.85 });

        IMBUED_BAT_LIGHT_CONE.renderTargetingPreview(gr, caster, mouseWorld, units);

        const ctx = { units, getUnit: (id: string) => units.find((u) => u.id === id) };
        const hits = ThickLineHitbox.getUnitsInHitbox(ctx, caster, ep.leftX, ep.leftY, ep.rightX, ep.rightY, LINE_THICKNESS);
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
            `Releases a cone of light dealing {${LIGHT_CONE_DAMAGE}} damage to up to ${LIGHT_CONE_MAX_TARGETS} enemies ahead.`,
            `Granted for one use by {Light Imbuement}.`,
        ];
    },
});
