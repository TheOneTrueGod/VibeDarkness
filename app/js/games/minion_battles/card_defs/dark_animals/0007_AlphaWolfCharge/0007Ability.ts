import { ChargeAttack } from '../../../abilities/templates/ChargeAttack';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

const ALPHA_WOLF_CHARGE_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="24" fill="#3d3d3d" stroke="#1a1a1a" stroke-width="3"/>
  <path d="M16 26 L28 32 L16 38 M48 26 L36 32 L48 38" stroke="#c4a875" stroke-width="4" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="8" fill="#1a1a1a" stroke="#c4a875" stroke-width="1"/>
</svg>`;

const alphaWolfCharge = new ChargeAttack({
    id: `${formatGroupId(AbilityGroupId.Enemy)}07`,
    name: 'Alpha Charge',
    image: ALPHA_WOLF_CHARGE_IMAGE,
    damage: 5,
    windupTime: 1.0,
    lungeDuration: 0.3,
    cooldownDuration: 2.5,
    baseMaxRange: 120,
    aiMaxRange: 100,
    capsuleRadiusMultiplier: 2.0,
    knockbackOnBlock: 60,
    preview: { color: 0xff3300, width: 24 },
    effectType: 'bite',
    effectDuration: 0.25,
    tooltipText: 'The Alpha charges forward, dealing {5} damage to each enemy in a wide path',
    cardName: 'Alpha Charge',
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
});

export const AlphaWolfChargeAbility = alphaWolfCharge;
export const AlphaWolfChargeCard = alphaWolfCharge.cardDef;
