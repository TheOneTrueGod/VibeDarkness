/**
 * Shield of Light — wrap the caster in a short-lived yellowish absorb shield.
 *
 * Same absorb/drain rules as Gravity Shield: a fat pool that dumps its armour in one round.
 * Self-cast only. Blinding Flare research adds a darkness-only knockback explosion on cast.
 */

import { AbilityPhase } from '../../../abilities/abilityTimings';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { spawnCasterChargeUpEffect } from '../../../abilities/casterChargeUpVisual';
import { getAbilityModifier } from '../../../abilities/abilityModifierHelpers';
import { damageEnemiesInCircle } from '../../../abilities/targetHelpers';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { spawnGatherLightWindupRing, type EngineWithGatherLight } from '../../../abilities/gatherLightHelpers';
import { ShieldBuff } from '../../../buffs/ShieldBuff';
import { Effect } from '../../../game/effects/Effect';
import type { EngineContext } from '../../../game/EngineContext';
import type { Unit } from '../../../game/units/Unit';
import type { KnockbackSource } from '../../../game/units/unitTypes';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { isDarkCreatureCharacterId } from '../../../game/units/unit_defs/unitDef';
import { knockbackCtxFromEngine, tryApplyKnockbackByTier } from '../../../crowdControl/knockbackKeywords';
import { DescriptiveValue } from '../../../../../researchTrees/descriptiveValue';
import { type CardDef } from '../../types';
import {
    LIGHT_SHIELD_ACTIVE_DURATION,
    LIGHT_SHIELD_COLOR,
    LIGHT_SHIELD_COOLDOWN_DURATION,
    LIGHT_SHIELD_DRAIN_PER_SECOND,
    LIGHT_SHIELD_DURATION_ROUNDS,
    LIGHT_SHIELD_FLARE_DAMAGE,
    LIGHT_SHIELD_FLARE_KNOCKBACK_TIER,
    LIGHT_SHIELD_FLARE_RADIUS,
    LIGHT_SHIELD_FLARE_TAG,
    LIGHT_SHIELD_HP,
    LIGHT_SHIELD_LIGHT_COST,
    LIGHT_SHIELD_PREFIRE_TIME,
    SHIELD_OF_LIGHT_ABILITY_ID,
} from './0805Constants';

const CARD_ID = SHIELD_OF_LIGHT_ABILITY_ID;
const MAX_USES = 1;

const SHIELD_OF_LIGHT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="solGlow" cx="0.5" cy="0.4" r="0.65">
      <stop offset="0%" stop-color="#fff8d0"/>
      <stop offset="55%" stop-color="#ffe066"/>
      <stop offset="100%" stop-color="#7a5a10" stop-opacity="0.9"/>
    </radialGradient>
  </defs>
  <path d="M32 8 L50 16 L50 32 C50 46 42 54 32 58 C22 54 14 46 14 32 L14 16 Z"
        fill="url(#solGlow)" stroke="#ffe066" stroke-width="2.5" opacity="0.95"/>
  <circle cx="32" cy="30" r="8" fill="#7a5a10" opacity="0.55"/>
  <circle cx="32" cy="30" r="3" fill="#fff8d0"/>
</svg>`;

function spawnShieldOfLightImpact(engine: EngineContext, position: { x: number; y: number }, radius: number): void {
    engine.addEffect(new Effect({
        x: position.x,
        y: position.y,
        duration: 0.35,
        effectType: 'Explosion',
        effectRadius: radius,
        effectProperties: { radius, color: LIGHT_SHIELD_COLOR, direction: 'expand' },
    }));
}

/** Blinding Flare: knockback explosion that only hits darkness creatures. */
function applyLightShieldFlare(engine: EngineContext, caster: Unit): void {
    const mod = caster.abilityModifiers[CARD_ID];
    if (!mod?.addTags?.includes(LIGHT_SHIELD_FLARE_TAG)) return;

    const damage = mod.explosionDamageFlat ?? LIGHT_SHIELD_FLARE_DAMAGE;
    const knockbackTier = mod.knockbackTier ?? LIGHT_SHIELD_FLARE_KNOCKBACK_TIER;
    const center = { x: caster.x, y: caster.y };
    const knockbackSource: KnockbackSource = { unitId: caster.id, abilityId: CARD_ID };
    const knockbackCtx = knockbackCtxFromEngine(engine);

    spawnShieldOfLightImpact(engine, center, LIGHT_SHIELD_FLARE_RADIUS);
    damageEnemiesInCircle({
        engine,
        caster,
        center,
        radius: LIGHT_SHIELD_FLARE_RADIUS,
        damage,
        abilityId: CARD_ID,
        attackType: 'melee',
        onHit: (unit) => {
            if (!isDarkCreatureCharacterId(unit.characterId)) return;
            tryDamageOrBlock(unit, {
                engine,
                gameTime: engine.gameTime,
                eventBus: engine.eventBus,
                attackerX: center.x,
                attackerY: center.y,
                attackerId: caster.id,
                abilityId: CARD_ID,
                damage,
                attackType: 'melee',
            });
            tryApplyKnockbackByTier(unit, knockbackTier, knockbackSource, center.x, center.y, knockbackCtx);
        },
    });
}

function applyShieldOfLightCast(engine: EngineContext, caster: Unit): void {
    caster.addBuff(
        new ShieldBuff(LIGHT_SHIELD_HP, LIGHT_SHIELD_DRAIN_PER_SECOND, 'light'),
        engine.gameTime,
        engine.roundNumber,
        engine.eventBus,
    );
    spawnShieldOfLightImpact(engine, { x: caster.x, y: caster.y }, caster.radius + 8);
    applyLightShieldFlare(engine, caster);
}

export const ShieldOfLightAbility = defineAbility({
    id: CARD_ID,
    name: 'Shield of Light',
    image: SHIELD_OF_LIGHT_IMAGE,
    resourceCost: { resourceId: 'light', amount: LIGHT_SHIELD_LIGHT_COST },
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: [{ chargeType: 'roundCharge', chargesPerRecovery: 1, usesRecovered: 1 }],
    prefireTime: LIGHT_SHIELD_PREFIRE_TIME,
    clearMovementOnComplete: true,
    abilityTimings: [
        {
            id: 'windup',
            start: 0,
            end: LIGHT_SHIELD_PREFIRE_TIME,
            abilityPhase: AbilityPhase.Windup,
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        spawnGatherLightWindupRing(
                            ctx.engine as EngineWithGatherLight,
                            ctx.caster,
                            LIGHT_SHIELD_COLOR,
                        );
                    }),
                },
            ],
        },
        {
            id: 'active',
            start: LIGHT_SHIELD_PREFIRE_TIME,
            end: LIGHT_SHIELD_PREFIRE_TIME + LIGHT_SHIELD_ACTIVE_DURATION,
            abilityPhase: AbilityPhase.Active,
            tags: ['juggernaut'] as const,
            doNotRefund: true,
            castBehaviours: [
                {
                    timingStart: 'start',
                    behaviour: CastBehaviours.Instant((ctx) => {
                        applyShieldOfLightCast(ctx.engine as EngineContext, ctx.caster);
                    }),
                },
            ],
        },
        {
            id: 'cooldown',
            start: LIGHT_SHIELD_PREFIRE_TIME + LIGHT_SHIELD_ACTIVE_DURATION,
            end: LIGHT_SHIELD_PREFIRE_TIME + LIGHT_SHIELD_ACTIVE_DURATION + LIGHT_SHIELD_COOLDOWN_DURATION,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [],

    getRange: () => ({ minRange: 0, maxRange: 0 }),

    beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], _active: ActiveAbility): void {
        spawnCasterChargeUpEffect(
            engine as { addEffect(effect: Effect): void },
            caster,
            LIGHT_SHIELD_PREFIRE_TIME + LIGHT_SHIELD_ACTIVE_DURATION,
            { color: LIGHT_SHIELD_COLOR },
        );
    },

    getTooltipText(gameState?: unknown): string[] {
        const mod = getAbilityModifier(gameState, undefined, CARD_ID);
        const lines = [
            'Wrap yourself in a shield of light.',
            `Grants a {${DescriptiveValue.Large}} shield absorbing {${LIGHT_SHIELD_HP}} damage.`,
            `The shield drains over {${LIGHT_SHIELD_DURATION_ROUNDS}} round.`,
        ];
        if (mod.addTags?.includes(LIGHT_SHIELD_FLARE_TAG)) {
            const damage = mod.explosionDamageFlat ?? LIGHT_SHIELD_FLARE_DAMAGE;
            const knockbackTier = mod.knockbackTier ?? LIGHT_SHIELD_FLARE_KNOCKBACK_TIER;
            lines.push(`A burst of light deals {${damage}} damage to nearby darkness creatures.`);
            lines.push(`{knockback ${knockbackTier}}`);
        }
        return lines;
    },

    renderTargetingPreviewSelectedTargets(): void {
        // Self-cast — no targeting preview.
    },
});

export const ShieldOfLightCard: CardDef = {
    abilityId: CARD_ID,
};
