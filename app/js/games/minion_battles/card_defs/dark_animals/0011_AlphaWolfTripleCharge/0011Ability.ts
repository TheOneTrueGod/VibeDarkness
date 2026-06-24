import { MultiChargeAttack } from '../../../abilities/templates/MultiChargeAttack';
import type { AbilityRecoveryRule } from '../../../abilities/Ability';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { UnitTag } from '../../../game/units/unitTag';

const ABILITY_ID = `${formatGroupId(AbilityGroupId.Enemy)}11`;

const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
	{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];

const IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="24" fill="#5a1a1a" stroke="#1a1a1a" stroke-width="3"/>
  <path d="M12 28 L22 32 L12 36 M28 28 L38 32 L28 36 M44 28 L54 32 L44 36" stroke="#ff6600" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

const alphaWolfTripleCharge = new MultiChargeAttack({
	id: ABILITY_ID,
	name: 'Frenzied Charge',
	image: IMAGE,
	damage: 5,
	dashes: 3,
	firstWindupTime: 1.2,
	followUpWindupTime: 0.5,
	lungeDuration: 0.3,
	cooldownDuration: 2.0,
	baseMaxRange: 120,
	aiMaxRange: 100,
	capsuleRadiusMultiplier: 1.28,
	preview: { color: 0xff6600, width: 19 },
	effectType: 'bite',
	effectDuration: 0.25,
	tooltipText: 'The enraged Alpha charges three times in quick succession, dealing {5} damage per hit',
	requiredTags: [UnitTag.Enraged],
	maxUses: MAX_USES,
	recoveries: RECOVERIES,
	juggernautDuringActive: true,
	rangeIncludesCasterRadius: false,
	aiNinjutsu: { ignore: true },
});

export const AlphaWolfTripleChargeAbility = alphaWolfTripleCharge;
export const AlphaWolfTripleChargeCard = alphaWolfTripleCharge.cardDef;
