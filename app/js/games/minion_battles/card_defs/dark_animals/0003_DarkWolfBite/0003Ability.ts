import { ChargeAttack } from '../../../abilities/templates/ChargeAttack';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

const DARK_WOLF_BITE_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="20" fill="#2d2d2d" stroke="#1a1a1a" stroke-width="2"/>
  <path d="M20 28 L28 32 L20 36 M44 28 L36 32 L44 36" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

const wolfBite = new ChargeAttack({
    id: `${formatGroupId(AbilityGroupId.Enemy)}03`,
    name: 'Dark Wolf Bite',
    image: DARK_WOLF_BITE_IMAGE,
    damage: 3,
    windupTime: 0.6,
    lungeDuration: 0.3,
    cooldownDuration: 2,
    baseMaxRange: 100,
    aiMaxRange: 80,
    capsuleRadiusMultiplier: 1.0,
    knockbackOnBlock: 40,
    preview: { color: 0xff0000, width: 12 },
    effectType: 'bite',
    effectDuration: 0.2,
    tooltipText: 'Lunge at a target, dealing {3} damage to each enemy crossed',
    cardName: 'Dark Wolf Bite',
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
});

export const DarkWolfBiteAbility = wolfBite;
export const DarkWolfBiteCard = wolfBite.cardDef;
