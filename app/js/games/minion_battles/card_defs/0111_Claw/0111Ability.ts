/**
 * Claw - Warrior card. Dodge-like dash toward target with iframes.
 * Damages and knocks back any enemies the caster touches during the dash.
 */

import { AbilityState, AbilityEventType } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import { createPixelTargetPreview } from '../../abilities/previewHelpers';
import type { Unit } from '../../game/units/Unit';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { CastBehaviours } from '../../abilities/CastBehaviours';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}11` as '0111';
const CLAW_DURATION = 0.4;
const CLAW_MAX_DISTANCE = 160;
const COLLISION_STEP = 4;
const DAMAGE = 5;
const KNOCKBACK_TIER = 2;

const CLAW_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 44 L28 32 L36 40 L44 28 M24 48 L32 36 L40 44" stroke="#6b5b4f" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="14" fill="#2d2d2d" stroke="#1a1a1a"/>
</svg>`;

export const ClawAbility: AbilityStatic = {
	id: CARD_ID,
	name: 'Claw',
	image: CLAW_IMAGE,
	resourceCost: null,
	rechargeTurns: 0,
	prefireTime: CLAW_DURATION,
	abilityTimings: [
		{
			id: 'active',
			start: 0,
			end: CLAW_DURATION,
			abilityPhase: AbilityPhase.Iframe,
			behaviour: CastBehaviours.Dash()
				.withMaxDistance(CLAW_MAX_DISTANCE)
				.withCollisionStep(COLLISION_STEP)
				.withAfterimages(true)
				.addHitbox('caster', { shape: 'circle', range: 'caster' }, {
					damage: DAMAGE,
					attackType: 'melee',
				}),
		},
		{ id: 'cooldown', start: CLAW_DURATION, end: CLAW_DURATION + 0.8, abilityPhase: AbilityPhase.Cooldown },
	],
	targets: [{ type: 'pixel', label: 'Direction to dash' }] as TargetDef[],
	aiSettings: { minRange: 0, maxRange: CLAW_MAX_DISTANCE },

	abilityEvents: {
		[AbilityEventType.ON_CAST_START]: [
			{
				conditions: [{ type: 'always' }],
				effects: [{ type: 'recoverCharge', chargeType: 'staminaCharge', amount: 1, excludeCurrentAbility: true }],
			},
		],
		[AbilityEventType.ON_ATTACK_HIT]: [
			{
				conditions: [{ type: 'always' }],
				effects: [{ type: 'applyKnockbackToPrimaryTarget', tier: KNOCKBACK_TIER, sourceAbilityId: CARD_ID }],
			},
		],
	},

	getTooltipText(_gameState?: unknown): string[] {
		return [
			'Dash toward a point with iframes',
			`Deal {${DAMAGE}} damage and knock back enemies you touch`,
		];
	},

	getAbilityStates(currentTime: number): AbilityStateEntry[] {
		if (currentTime < CLAW_DURATION) {
			return [{ state: AbilityState.IFRAMES }];
		}
		return [];
	},

	onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
		// Melee blocked: no additional behaviour.
	},

	renderTargetingPreview: createPixelTargetPreview(CLAW_MAX_DISTANCE),
};

export const ClawCard: CardDef = {
	abilityId: CARD_ID,
};
