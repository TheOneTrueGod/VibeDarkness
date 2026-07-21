/**
 * Claw - Warrior card. Dodge-like dash toward target with iframes.
 * Damages and knocks back any enemies the caster touches during the dash.
 */

import { AbilityState, AbilityEventType } from '../../abilities/Ability';
import type { AbilityRecoveryRule, AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import { createMovementTargetPreview } from '../../abilities/previewHelpers';
import { resolveTooltipContext } from '../../abilities/abilityModifierHelpers';
import {
	formatTooltipLegacyLines,
	type TooltipTokenBindings,
} from '../../abilities/tooltipTokens';
import type { Unit } from '../../game/units/Unit';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { nullHitbox } from '../../hitboxes';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}11` as '0111';
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
	{ chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 },
];
const CLAW_DURATION = 0.4;
export const CLAW_MAX_DISTANCE = 100;
export const CLAW_COLLISION_STEP = 4;
export const CLAW_DAMAGE = 5;
const DAMAGE = CLAW_DAMAGE;
const KNOCKBACK_TIER = 2;

const TOOLTIP_LINES = [
	'Dash toward a point with iframes',
	'Deal {{DAMAGE}} damage and knock back enemies you touch',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
	DAMAGE: { kind: 'damage', base: DAMAGE },
};

const CLAW_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M20 44 L28 32 L36 40 L44 28 M24 48 L32 36 L40 44" stroke="#6b5b4f" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="14" fill="#2d2d2d" stroke="#1a1a1a"/>
</svg>`;

export const ClawAbility: AbilityStatic = {
	id: CARD_ID,
	name: 'Claw',
	image: CLAW_IMAGE,
	resourceCost: { resourceId: 'movement_points', amount: 1 },
	rechargeTurns: 0,
	maxUses: MAX_USES,
	recoveries: RECOVERIES,
	prefireTime: CLAW_DURATION,
	abilityTimings: [
		{
			id: 'active',
			start: 0,
			end: CLAW_DURATION,
			abilityPhase: AbilityPhase.Active,
			doNotRefund: true,
			tags: ['iframe'] as const,
			targetDef: { kind: 'select', label: 'Dash direction', hitbox: nullHitbox, filter: 'any', allowMiss: true },
			behaviour: CastBehaviours.Dash()
				.withMaxDistance(CLAW_MAX_DISTANCE)
				.withCollisionStep(CLAW_COLLISION_STEP)
				.withAfterimages(true)
				.addHitbox('caster', { shape: 'circle', range: 'caster' }, {
					damage: DAMAGE,
					attackType: 'melee',
				}),
			emitterDef: {
				mode: 'instant',
				spriteEffectId: 'clawFlash',
				effectDuration: 0.3,
			},
		},
		{ id: 'cooldown', start: CLAW_DURATION, end: CLAW_DURATION + 0.8, abilityPhase: AbilityPhase.Cooldown },
	],
	targets: [],
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

	getTooltipText(gameState?: unknown): string[] {
		return formatTooltipLegacyLines(
			TOOLTIP_LINES,
			TOOLTIP_BINDINGS,
			resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
		);
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

	renderTargetingPreviewSelectedTargets: createMovementTargetPreview(CLAW_MAX_DISTANCE, CLAW_COLLISION_STEP),
};

export const ClawCard: CardDef = {
	abilityId: CARD_ID,
};
