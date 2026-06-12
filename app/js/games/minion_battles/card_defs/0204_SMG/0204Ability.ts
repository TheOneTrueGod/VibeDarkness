import type { AbilityRecoveryRule, AbilityStatic } from '../../abilities/Ability';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { defineGunAbility } from '../../abilities/archetypes/defineGunAbility';

const CARD_ID = `${formatGroupId(AbilityGroupId.Ranger)}04`;
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
const FIRST_SHOT_TIME = 0.5;
const LAST_SHOT_TIME = 1.0;
const NUM_SHOTS = 8;
const COOLDOWN_TIME = 1.3;
const MAX_DISTANCE = 380;
const BULLET_SPEED = 1500;
const BULLET_DAMAGE = 10;
const INACCURACY_BASE = Math.PI / 16;

const SMG_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="10" y="26" width="32" height="8" rx="2" fill="#b0b0b0" stroke="#909090" stroke-width="1"/>
  <rect x="22" y="30" width="10" height="12" rx="2" fill="#3a3a3a" stroke="#202020" stroke-width="1"/>
  <rect x="34" y="24" width="12" height="6" rx="1" fill="#d0d0d0" />
  <rect x="18" y="34" width="6" height="10" rx="1" fill="#5a5a5a" />
</svg>`;

export const SMGAbility: AbilityStatic = defineGunAbility({
    id: CARD_ID,
    name: 'SMG',
    image: SMG_IMAGE,
    resourceCosts: [{ resourceId: 'ammo', amount: 20, allowPartialIfPositive: true }],
    rechargeTurns: 0,
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
    damage: BULLET_DAMAGE,
    maxDistance: MAX_DISTANCE,
    bulletSpeed: BULLET_SPEED,
    baseInaccuracy: INACCURACY_BASE,
    numShots: NUM_SHOTS,
    shotSpacing: (LAST_SHOT_TIME - FIRST_SHOT_TIME) / (NUM_SHOTS - 1),
    targetLabel: 'Spray direction',
    prefireTime: FIRST_SHOT_TIME,
    cooldownDuration: COOLDOWN_TIME,
    getTooltipText: () => [
        'Spray {8} bullets in a cone',
        'Each bullet deals {10} damage',
    ],
});

export const SMGCard: CardDef = {
    abilityId: CARD_ID,
};
