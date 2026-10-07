/**
 * DisplacerBolt - Displacer Spirit ranged ability. Aims like the slime's shot (same targeting range,
 * telegraph, and AI range) but hurls a faster bolt that keeps flying to twice that range. A ranged
 * harasser that punishes players who stand just outside slime distance.
 */

import type { AbilityStatic, AttackBlockedInfo } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { TargetDef } from '../../../abilities/targeting';
import type { Unit } from '../../../game/units/Unit';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { deactivateProjectileOnBlock } from '../../../abilities/effectHelpers';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { defineAbility } from '../../../abilities/defineAbility';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import { formatTooltipLegacyLines, type TooltipTokenBindings } from '../../../abilities/tooltipTokens';
import {
    SlimeShotAbility,
    SLIME_SHOT_MAX_DISTANCE,
    SLIME_SHOT_PROJECTILE_SPEED,
} from '../../0001_SlimeShot/0001Ability';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}17`;
export const DISPLACER_BOLT_ID = CARD_ID;

const LOCK_TIME = 0.5;
const PREFIRE_TIME = 1.0;
const DAMAGE = 4;
const PROJECTILE_RADIUS = 5;
const PROJECTILE_SCALE = 0.5;

/** Targeting / use / AI range: identical to the slime's. */
export const DISPLACER_BOLT_TARGET_RANGE = SLIME_SHOT_MAX_DISTANCE;
/** Bolt is a bit faster than the slime's glob (1.2x). */
export const DISPLACER_BOLT_SPEED_MULTIPLIER = 1.2;
export const DISPLACER_BOLT_SPEED = SLIME_SHOT_PROJECTILE_SPEED * DISPLACER_BOLT_SPEED_MULTIPLIER;
/** Total flight distance is twice the targeting range. */
export const DISPLACER_BOLT_TRAVEL_DISTANCE = DISPLACER_BOLT_TARGET_RANGE * 2;
/** Projectile "lifetime" in seconds (distance / speed); the projectile expires after this much flight. */
export const DISPLACER_BOLT_LIFETIME_SEC = DISPLACER_BOLT_TRAVEL_DISTANCE / DISPLACER_BOLT_SPEED;

const TOOLTIP_LINES = ['Hurls a bolt that flies twice as far as it aims, dealing {{DAMAGE}} damage to an enemy'] as const;
const TOOLTIP_BINDINGS: TooltipTokenBindings = {
    DAMAGE: { kind: 'damage', base: DAMAGE },
};

const SPIT_URLS = [1, 2, 3, 4].map(
    (n) => new URL(`../../../assets/projectiles/slime_spit_f${n}.svg`, import.meta.url).href,
);

const DISPLACER_BOLT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="g" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#d9f0ff"/>
      <stop offset="45%" stop-color="#3366cc"/>
      <stop offset="100%" stop-color="#001133"/>
    </radialGradient>
  </defs>
  <circle cx="32" cy="32" r="28" fill="#3366cc" opacity="0.2"/>
  <circle cx="32" cy="32" r="20" fill="url(#g)"/>
</svg>`;

const _base: AbilityStatic = defineAbility({
    id: CARD_ID,
    name: 'Displacer Bolt',
    image: DISPLACER_BOLT_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { id: 'draw', start: 0, end: LOCK_TIME, abilityPhase: AbilityPhase.Windup },
        {
            id: 'active',
            start: LOCK_TIME,
            end: PREFIRE_TIME,
            abilityPhase: AbilityPhase.Active,
            doNotRefund: true,
            behaviour: CastBehaviours.ProjectileLaunch()
                .withSpeed(DISPLACER_BOLT_SPEED)
                // maxRange clamps aim direction; travelFullRange makes the bolt fly the whole distance.
                .withMaxRange(DISPLACER_BOLT_TRAVEL_DISTANCE)
                .withTravelFullRange()
                .withBaseDamage(DAMAGE)
                .withRadius(PROJECTILE_RADIUS)
                .withSpriteConfig({
                    sprite: { fps: 8, scale: PROJECTILE_SCALE, frameFiles: SPIT_URLS },
                    loop: true,
                }),
        },
        {
            id: 'cooldown',
            start: PREFIRE_TIME,
            end: PREFIRE_TIME + 3.0,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: DISPLACER_BOLT_TARGET_RANGE },
    getRange: (_caster: Unit) => ({ minRange: 0, maxRange: DISPLACER_BOLT_TARGET_RANGE }),

    getTooltipText(gameState?: unknown): string[] {
        return formatTooltipLegacyLines(
            TOOLTIP_LINES,
            TOOLTIP_BINDINGS,
            resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
        );
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },
});

export const DisplacerBoltAbility: AbilityStatic = {
    ..._base,
    // Same telegraph as the slime (aim line capped at the slime's targeting range).
    renderActivePreview: SlimeShotAbility.renderActivePreview,
};

export const DisplacerBoltCard: CardDef = {
    abilityId: CARD_ID,
};
