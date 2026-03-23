import { ChargeAttack } from '../../../abilities/templates/ChargeAttack';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

const BOAR_CHARGE_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="24" fill="#4a3728" stroke="#2d1f14" stroke-width="2"/>
  <path d="M16 28 L28 32 L16 36 M48 28 L36 32 L48 36" stroke="#8b7355" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;

const boarCharge = new ChargeAttack({
    id: `${formatGroupId(AbilityGroupId.Enemy)}06`,
    name: 'Charge',
    image: BOAR_CHARGE_IMAGE,
    damage: 4,
    windupTime: 0.6,
    lungeDuration: 0.3,
    cooldownDuration: 2,
    baseMaxRange: 100,
    aiMaxRange: 90,
    capsuleRadiusMultiplier: 1.5,
    knockbackOnBlock: 50,
    preview: { color: 0xff6600, width: 16 },
    effectType: 'bite',
    effectDuration: 0.2,
    tooltipText: 'Charge at a target, dealing {4} damage to each enemy crossed (wide hitbox)',
    cardName: 'Charge',
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
});

export const BoarChargeAbility = boarCharge;
export const BoarChargeCard = boarCharge.cardDef;
