/**
 * Imbued Bat — a light-infused version of Swing Bat, activated by the swap network
 * when Light Imbuement is cast.
 *
 * Inherits Swing Bat's perpendicular melee swing, then releases a forward arc of
 * light damage from the caster (hollow near the unit) out to LIGHT_CONE_MAX_RANGE.
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
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import type { Unit } from '../../../game/units/Unit';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { EngineWithGatherLight, spawnGatherLightWindupRing } from '@/games/minion_battles/abilities/gatherLightHelpers';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import {
    formatTooltipLegacyLines,
    type TooltipTokenBindings,
} from '../../../abilities/tooltipTokens';
import {
    resolveStrictAoEHits,
    splitSelectOrderTargets,
} from '../../../abilities/priorityFillHits';
import { filterCombatHitTargets } from '../../../abilities/combatTargetFilter';
import { areEnemies } from '../../../game/teams';

// ---- Constants ----

const CARD_ID = `${formatGroupId(AbilityGroupId.Light)}03`;

const BASE_MAX_RANGE = 25;
const SWING_LENGTH = 80;
const LINE_THICKNESS = 26;
const MAX_TARGETS = 3;
const SWING_BAT_ABILITY_ID = '0115';

const PRIMARY_DAMAGE = 18;
const KNOCKBACK_TIER = 3;

/** Forward light burst from the caster; wide arc opens toward the bat swing. */
export const LIGHT_CONE_MAX_RANGE = 100;
export const LIGHT_CONE_HALF_ARC_RAD = Math.PI / 4;
export const LIGHT_CONE_DAMAGE = 12;
const LIGHT_CONE_MAX_TARGETS = 5;

const TOOLTIP_LINES = [
    'Swing your light-imbued bat dealing {{DAMAGE}} damage to up to {{MAX_TARGETS}} enemies.',
    '{{KNOCKBACK}}.',
    'Releases an arc of light dealing {{DAMAGE_2}} damage to up to {{LIGHT_CONE_MAX_TARGETS}} enemies ahead.',
    'Granted for one use by {Light Imbuement}.',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: PRIMARY_DAMAGE },
    MAX_TARGETS: { kind: 'plain', value: MAX_TARGETS },
    KNOCKBACK: { kind: 'knockback', tier: KNOCKBACK_TIER },
    DAMAGE_2: { kind: 'damage', base: LIGHT_CONE_DAMAGE },
    LIGHT_CONE_MAX_TARGETS: { kind: 'plain', value: LIGHT_CONE_MAX_TARGETS },
};
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
    (caster) => ({ x: caster.x, y: caster.y }),
    (caster, aimX, aimY) => {
        const ep = IMBUED_BAT_HITBOX.getEndpoints(caster, aimX, aimY);
        return Math.atan2(ep.centerY - caster.y, ep.centerX - caster.x);
    },
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
            x: cone.originX,
            y: cone.originY,
            duration: LIGHT_CONE_EFFECT_DURATION,
            effectType: LIGHT_CONE_BURST_EFFECT_TYPE,
            effectData: {
                centerAngle: cone.centerAngle,
                halfArcRad: cone.halfArcRad,
                innerR: cone.minR,
                outerR: cone.maxR,
            },
        }));

        const split = splitSelectOrderTargets(
            ctx.allTargets,
            MAX_TARGETS,
            [LIGHT_CONE_MAX_TARGETS],
        );
        const companionCommitted = split.companionIds[0] ?? [];
        // resolveTargets (not resolveHits) so we get the full in-cone set before priority fill.
        const inCone = IMBUED_BAT_LIGHT_CONE.resolveTargets(
            ctx.caster,
            { x: aimX, y: aimY },
            ctx.engine.units,
        ).filter((u) => areEnemies(ctx.caster.teamId, u.teamId));
        const inShape = filterCombatHitTargets(inCone, ctx.engine.gameTime);
        const coneHits = resolveStrictAoEHits({
            committedIds: companionCommitted,
            inShapeUnits: inShape,
            numTargets: LIGHT_CONE_MAX_TARGETS,
        });
        for (const unit of coneHits) {
            tryDamageOrBlock(unit, {
                engine: ctx.engine,
                gameTime: ctx.engine.gameTime,
                eventBus: ctx.engine.eventBus,
                attackerX: cone.originX,
                attackerY: cone.originY,
                attackerId: ctx.caster.id,
                abilityId: CARD_ID,
                damage: LIGHT_CONE_DAMAGE,
                attackType: 'melee',
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
    tags: ['secondary'],
    resourceCost: null,
    rechargeTurns: 0,
    maxUses: 1,
    recoveries: [],
    prefireTime: 0.2,
    abilityTimings: [
        { id: 'windup',   start: 0,   end: 0.2,  abilityPhase: AbilityPhase.Windup, castBehaviours: [
					{
							timingStart: 'start',
							behaviour: CastBehaviours.Instant((ctx) => {
									spawnGatherLightWindupRing(ctx.engine as EngineWithGatherLight, ctx.caster);
							}),
					},
			], },
        {
            id: 'hit',
            start: 0.2,
            end: 0.3,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            targetDef: {
                kind: 'select',
                label: 'Target',
                hitbox: IMBUED_BAT_HITBOX,
                filter: 'enemy',
                allowMiss: true,
                companionHitboxes: [{
                    hitbox: IMBUED_BAT_LIGHT_CONE,
                    numTargets: LIGHT_CONE_MAX_TARGETS,
                    filter: 'enemy',
                }],
            },
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

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },
});
