/**
 * Sneaky Punch - Warrior melee ability.
 *
 * Deals bonus damage against stunned or bleeding targets.
 * Exclusive upgrade to Punch via the Training research tree.
 */

import type { AbilityRecoveryRule } from '../../abilities/Ability';
import { defineMeleeStrike } from '../../abilities/archetypes/defineMeleeStrike';
import { Effect } from '../../game/effects/Effect';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { STUNNED_BUFF_TYPE } from '../../buffs/StunnedBuff';
import { BLEED_BUFF_TYPE } from '../../buffs/BleedBuff';
import { EXPOSED_BUFF_TYPE } from '../../buffs/ExposedBuff';
import { type CardDef } from '../types';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}18`;
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 },
];
const MAX_RANGE = 36; // px
const LINE_THICKNESS = 22; // px
const BASE_DAMAGE = 8;
// ~30% medium bonus on top of base = 12
const BONUS_DAMAGE = 12;
// Small windup lunge — not for reach, but to route target selection through the
// deferred (pre-simulation) select-target path instead of the mid-window lookahead path.
const LUNGE_DISTANCE = 10; // px

const SNEAKY_PUNCH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="snFistBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a1a0f"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <circle cx="32" cy="32" r="22" fill="url(#snFistBg)" stroke="#4ade80" stroke-width="3"/>
  <rect x="22" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#d1fae5" stroke="#111827" stroke-width="1.5"/>
  <rect x="29" y="19" width="7" height="8" rx="1.5" ry="1.5" fill="#d1fae5" stroke="#111827" stroke-width="1.5"/>
  <rect x="36" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#d1fae5" stroke="#111827" stroke-width="1.5"/>
  <path d="M22 27 C24 26 27 26 29 27 L29 31 L22 31 Z" fill="#a7f3d0" stroke="#111827" stroke-width="1.5"/>
  <rect x="23" y="29" width="20" height="13" rx="3" ry="3" fill="#d1fae5" stroke="#111827" stroke-width="1.8"/>
  <rect x="26" y="40" width="14" height="8" rx="2" ry="2" fill="#111827"/>
  <!-- Subtle diagonal rays suggesting stealth strike -->
  <path d="M14 18 L20 22" stroke="#4ade80" stroke-width="2" stroke-linecap="round"/>
  <path d="M48 18 L42 22" stroke="#4ade80" stroke-width="2" stroke-linecap="round"/>
  <path d="M32 12 L32 18" stroke="#4ade80" stroke-width="2" stroke-linecap="round"/>
  <!-- Small droplet accent (bleed/vulnerability) -->
  <ellipse cx="47" cy="40" rx="3" ry="4" fill="#4ade80" opacity="0.8"/>
  <path d="M47 36 L47 39" stroke="#4ade80" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

export const SneakyPunchAbility = defineMeleeStrike({
    id: CARD_ID,
    name: 'Sneaky Punch',
    image: SNEAKY_PUNCH_IMAGE,
    resourceCost: null,
    rechargeTurns: 1,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    damage: BASE_DAMAGE,
    range: MAX_RANGE,
    thickness: LINE_THICKNESS,
    impactType: 'punch',
    impactAt: 0.5,
    forwardDistance: 12,
    backwardDistance: 6,
    windupDuration: 0.15,
    activeDuration: 0.1,
    cooldownDuration: 1.15,
    movementLockUntil: 0.55,
    lunge: { distance: LUNGE_DISTANCE },
    aiMaxRange: MAX_RANGE + LUNGE_DISTANCE,

    onDamage(ctx, unit) {
        const isVulnerable = unit.hasBuff(STUNNED_BUFF_TYPE) || unit.hasBuff(BLEED_BUFF_TYPE) || unit.hasBuff(EXPOSED_BUFF_TYPE);
        if (isVulnerable) {
            // Flat bonus damage; return value unused, so no need for the shield/armour breakdown.
            unit.takeDamage(BONUS_DAMAGE, ctx.caster.id, ctx.engine.eventBus);
            ctx.engine.addEffect(new Effect({
                x: unit.x,
                y: unit.y,
                duration: 0.3,
                effectType: 'CritShockwave',
            }));
        }
    },

    getTooltipText(): string[] {
        return [
            `Hit {1} enemy for {${BASE_DAMAGE}} damage`,
            `+{${BONUS_DAMAGE}} bonus damage vs stunned, {bleeding}, or {exposed} enemies`,
        ];
    },
});

export const SneakyPunchCard: CardDef = {
    abilityId: CARD_ID,
};
