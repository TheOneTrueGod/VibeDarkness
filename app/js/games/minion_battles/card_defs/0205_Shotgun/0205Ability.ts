import type { AbilityRecoveryRule, AbilityStatic } from '../../abilities/Ability';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { defineGunAbility } from '../../abilities/archetypes/defineGunAbility';
import {
    ABILITY_DAMAGE_MODIFIER_MULTIPLIER_OVERRIDES,
    DEFAULT_DAMAGE_MODIFIER_MULTIPLIER,
} from '../../abilities/damageModifiers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Ranger)}05`;
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const SHOT_TIME = 0.5;
const COOLDOWN_TIME = 1.3;
const MAX_DISTANCE = 224;
const BULLET_SPEED = 1300;
const BULLET_DAMAGE = 10;
const PELLETS = 6;
const INACCURACY_BASE = Math.PI / 16;

const SHOTGUN_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="28" width="40" height="6" rx="2" fill="#b8b8b8" stroke="#909090" stroke-width="1"/>
  <rect x="24" y="32" width="10" height="14" rx="2" fill="#3b2a1a" stroke="#1f140c" stroke-width="1"/>
  <rect x="12" y="34" width="8" height="8" rx="2" fill="#5c4033" />
</svg>`;

export const ShotgunAbility: AbilityStatic = defineGunAbility({
    id: CARD_ID,
    name: 'Shotgun',
    image: SHOTGUN_IMAGE,
    resourceCosts: [{ resourceId: 'ammo', amount: 15, allowPartialIfPositive: true }],
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    damageModifierMultiplier: ABILITY_DAMAGE_MODIFIER_MULTIPLIER_OVERRIDES[CARD_ID] ?? DEFAULT_DAMAGE_MODIFIER_MULTIPLIER,
    damage: BULLET_DAMAGE,
    maxDistance: MAX_DISTANCE,
    bulletSpeed: BULLET_SPEED,
    baseInaccuracy: INACCURACY_BASE,
    pelletsPerShot: PELLETS,
    pelletSpeedVariation: { min: 0.9, max: 1.1 },
    targetLabel: 'Blast direction',
    prefireTime: SHOT_TIME,
    cooldownDuration: COOLDOWN_TIME,
    getTooltipText: () => [
        `Fire ${PELLETS} pellets in a cone`,
        'Each pellet deals {10} damage',
    ],
});

export const ShotgunCard: CardDef = {
    abilityId: CARD_ID,
};
