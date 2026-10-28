/**
 * Digging Claws – Earth Core card. Wall-penetrating dash that damages rock tiles in transit.
 * Built on `CastBehaviours.Dash` (pass-through-terrain, path-tile hook and a touch hitbox), so no
 * `doCardEffect` or ability note is needed. The cast ends as soon as the dash does (no cooldown). If the dash ends inside a wall, the dash's
 * conditional cancel lets the player chain another Entombed ability; otherwise the shared
 * wall-unstick system (`tickWallUnstick`) pushes the unit out.
 */

import type { AbilityStatic, AbilityStateEntry } from '../../../abilities/Ability';
import { AbilityState, AbilityEventType } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { FIXED_DT } from '../../../game/gameConstants';
import { createPixelTargetPreview } from '../../../abilities/previewHelpers';
import { CastBehaviours } from '../../../abilities/CastBehaviours';
import { strikeTerrain } from '../../../abilities/CastBehaviours/TerrainStrikeBehaviour';
import { nullHitbox } from '../../../hitboxes';
import type { ResolvedTarget, ActiveAbility } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { Effect } from '../../../game/effects/Effect';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { getBodyColorForUnit, getCharacterSpriteKey } from '../../../game/units/unit_defs/unitDef';
import { ContinuousEmitter, IntervalEmitter } from '../../../game/effects/EffectEmitter';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import { TerrainType } from '../../../terrain/TerrainType';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import {
	formatTooltipLegacyLines,
	type TooltipTokenBindings,
} from '../../../abilities/tooltipTokens';

const CARD_ID = `${formatGroupId(AbilityGroupId.Earth)}34` as '0534';
const MAX_USES = 2;
/** The dash movement. The cast ends one tick after it (see the `dashEnd` interval); no cooldown. */
const DASH_DURATION = 0.4;
const MAX_DISTANCE = 160;
const UNIT_DAMAGE = 6;
export const DIGGING_CLAWS_MAX_TARGETS = 5;
const ROCK_DAMAGE = 35;
const KNOCKBACK_TIER = 2;

const TOOLTIP_LINES = [
	'Dashing attack that deals {{DAMAGE}} damage and knock back up to {{MAX_TARGETS}} enemies you touch',
] as const;

const TOOLTIP_BINDINGS: TooltipTokenBindings = {
	DAMAGE: { kind: 'damage', base: UNIT_DAMAGE },
	MAX_TARGETS: { kind: 'plain', value: DIGGING_CLAWS_MAX_TARGETS },
};
const AFTERIMAGE_DURATION = 6 / 60;

const DIGGING_CLAWS_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="28" fill="#3a3028" stroke="#1a1a1a"/>
  <path d="M18 46 L28 28 M24 48 L34 30 M30 46 L40 28"
        stroke="#a07840" stroke-width="3.5" fill="none" stroke-linecap="round"/>
</svg>`;

/**
 * The dash: a fixed-speed run of `MAX_DISTANCE` that ignores terrain, damages every intact rock tile
 * it enters (once per tile), and hits up to `DIGGING_CLAWS_MAX_TARGETS` enemies it touches, once each.
 * The knockback on each hit is an `abilityEvents` rule below.
 */
const diggingDash = CastBehaviours.Dash()
	.withMaxDistance(MAX_DISTANCE)
	.withConstantSpeed()
	.withPassThroughTerrain()
	.withOnPathTile((ctx, tile) => {
		strikeTerrain(ctx.engine, ctx.caster, [tile], { kind: 'damageRock', amount: ROCK_DAMAGE });
	})
	.addHitbox('caster', { shape: 'circle', range: 'caster' }, {
		damage: UNIT_DAMAGE,
		attackType: 'melee',
		filter: 'enemy',
		maxTargets: DIGGING_CLAWS_MAX_TARGETS,
	});

export const DiggingClawsAbility: AbilityStatic = {
	id: CARD_ID,
	name: 'Digging Claws',
	image: DIGGING_CLAWS_IMAGE,
	tags: ['Entombed'],
	resourceCost: { resourceId: 'movement_points', amount: 1 },
	rechargeTurns: 0,
	maxUses: MAX_USES,
	prefireTime: DASH_DURATION,
	abilityTimings: [
		{
			id: 'dash',
			start: 0,
			end: DASH_DURATION,
			abilityPhase: AbilityPhase.Active,
			doNotRefund: true,
			tags: ['iframe'] as const,
			targetDef: { kind: 'select', label: 'Direction to dash', hitbox: nullHitbox, filter: 'any', allowMiss: true },
			behaviour: diggingDash,
			conditionalCancel: {
				condition: ({ caster, engine }) => {
					const terrain = engine.terrainManager;
					return terrain != null && !terrain.isPassable(caster.x, caster.y);
				},
				abilityTagFilter: ['Entombed'],
			},
		},
		{
			// One tick past the dash, so the cast still covers the tick the dash ends on. Wall-unstick runs
			// before the ability tick and holds off only while an Entombed cast is in a non-cooldown phase;
			// without this, it would interrupt the cast before the dash's conditional cancel can pause.
			id: 'dashEnd',
			start: DASH_DURATION,
			end: DASH_DURATION + FIXED_DT,
			abilityPhase: AbilityPhase.Active,
			doNotRefund: true,
		},
	],
	targets: [],
	aiSettings: { minRange: 0, maxRange: MAX_DISTANCE },
	abilityEvents: {
		[AbilityEventType.ON_ATTACK_HIT]: [{
			conditions: [{ type: 'always' }],
			effects: [{ type: 'applyKnockbackToPrimaryTarget', tier: KNOCKBACK_TIER, sourceAbilityId: CARD_ID }],
		}],
	},

	getTooltipText(gameState?: unknown): string[] {
		return formatTooltipLegacyLines(
			TOOLTIP_LINES,
			TOOLTIP_BINDINGS,
			resolveTooltipContext(gameState, { ability: { id: CARD_ID } }),
		);
	},

	getAbilityStates(currentTime: number): AbilityStateEntry[] {
		if (currentTime < DASH_DURATION) {
			return [{ state: AbilityState.IFRAMES }];
		}
		return [];
	},

	beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], active: ActiveAbility): void {
		const eng = engine as AbilityEngineContext;
		const bodyColor = getBodyColorForUnit(caster);
		const radius = caster.radius;
		const characterSpriteKey = getCharacterSpriteKey(caster.characterId);

		const emitter = new ContinuousEmitter({
			x: caster.x,
			y: caster.y,
			attachedToUnitId: caster.id,
			lifetime: DASH_DURATION,
			emitIntervalFrames: 2,
			factory: (em) => {
				const effectData: Record<string, unknown> = { bodyColor, radius, characterSpriteKey };
				const angle = Math.random() * Math.PI * 2;
				const speed = 30 + Math.random() * 20;
				effectData.vx = Math.cos(angle) * speed;
				effectData.vy = Math.sin(angle) * speed;
				return [new Effect({
					x: em.x,
					y: em.y,
					duration: AFTERIMAGE_DURATION,
					// Hold the trail snapshot at a pause plane instead of letting it fade to nothing.
					pauseBehaviour: 'hold',
					effectType: 'Afterimage',
					effectData,
				})];
			},
		});
		eng.addEffectEmitter(emitter);

		const casterRadius = caster.radius;
		const rockDebrisEmitter = new IntervalEmitter({
			x: caster.x,
			y: caster.y,
			attachedToUnitId: caster.id,
			lifetime: DASH_DURATION,
			intervalSeconds: 0.08,
			fireImmediately: true,
			terrainCondition: [TerrainType.Rock],
			factory: (em) => {
				const particles: Effect[] = [];
				const count = 3 + Math.floor(Math.random() * 2);
				for (let i = 0; i < count; i++) {
					const angle = Math.random() * Math.PI * 2;
					const speed = 55 + Math.random() * 85;
					const scale = 0.7 + Math.random() * 0.7;
					particles.push(new Effect({
						x: em.x + (Math.random() - 0.5) * casterRadius,
						y: em.y + (Math.random() - 0.5) * casterRadius,
						duration: 0.18 + Math.random() * 0.14,
						effectType: 'RockChipParticle',
						effectData: {
							imageKey: 'rockChip',
							vx: Math.cos(angle) * speed,
							vy: Math.sin(angle) * speed,
							scale,
						},
					}));
				}
				return particles;
			},
		});
		eng.addEffectEmitter(rockDebrisEmitter);

		active.castPayload = { afterimageEmitter: emitter };
	},

	renderTargetingPreviewSelectedTargets: createPixelTargetPreview(MAX_DISTANCE),
};

export const DiggingClawsCard: CardDef = {
	abilityId: CARD_ID,
};
