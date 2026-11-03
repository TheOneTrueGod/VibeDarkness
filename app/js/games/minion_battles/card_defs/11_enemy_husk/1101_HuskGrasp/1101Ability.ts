/*
 * Husk Grasp — the Husk's slow, heavy lurch. A long wind-up gives players time to step away,
 * then a short lunge that hits everything it crosses.
 */

import { ChargeAttack } from '../../../abilities/templates/ChargeAttack';
import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';

export const HUSK_GRASP_ABILITY_ID = `${formatGroupId(AbilityGroupId.EnemyHusk)}01`;

const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const HUSK_GRASP_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="20" fill="#3a4a2a" stroke="#1a1a1a" stroke-width="2"/>
  <path d="M18 40 L26 24 M26 40 L32 22 M34 40 L38 24 M42 40 L46 28" stroke="#c8d6a0" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

const huskGrasp = new ChargeAttack({
    id: HUSK_GRASP_ABILITY_ID,
    name: 'Husk Grasp',
    image: HUSK_GRASP_IMAGE,
    damage: 5,
    windupTime: 1.5,
    lungeDuration: 0.35,
    cooldownDuration: 2.5,
    baseMaxRange: 90,
    aiMaxRange: 70,
    capsuleRadiusMultiplier: 1.2,
    knockbackTierOnBlock: 1,
    preview: { color: 0x8fa35a, width: 14 },
    effectType: 'bite',
    effectDuration: 0.25,
    tooltipText: 'Lurch at a target, dealing {5} damage to each enemy crossed',
    maxUses: MAX_USES,
    recoveries: RECOVERIES,
});

export const HuskGraspAbility = huskGrasp;
export const HuskGraspCard = huskGrasp.cardDef;
