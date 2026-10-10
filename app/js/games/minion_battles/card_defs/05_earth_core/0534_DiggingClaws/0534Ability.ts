/**
 * Digging Claws – Earth Core card. Wall-penetrating dash that damages rock tiles in transit.
 * The cast ends as soon as the dash does (no cooldown). If the dash ends inside a wall, the dash's
 * conditional cancel lets the player chain another Entombed ability; otherwise the shared
 * wall-unstick system (`tickWallUnstick`) pushes the unit out.
 */

import type { AbilityRecoveryRule, AbilityStatic, AbilityStateEntry } from '../../../abilities/Ability';
import { AbilityState, AbilityEventType } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import { createPixelTargetPreview } from '../../../abilities/previewHelpers';
import { nullHitbox } from '../../../hitboxes';
import type { ResolvedTarget, ActiveAbility } from '../../../game/types';
import type { Unit } from '../../../game/units/Unit';
import { Effect } from '../../../game/effects/Effect';
import { type CardDef } from '../../types';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { getPixelTargetPosition, getDirectionFromTo, damageEnemiesTouchingCaster } from '../../../abilities/targetHelpers';
import { getBodyColorForUnit, getCharacterSpriteKey } from '../../../game/units/unit_defs/unitDef';
import { isAbilityNote } from '../../../game/AbilityNote';
import { ContinuousEmitter, IntervalEmitter } from '../../../game/effects/EffectEmitter';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import type { TerrainManager } from '../../../terrain/TerrainManager';
import { TerrainType } from '../../../terrain/TerrainType';
import { resolveTooltipContext } from '../../../abilities/abilityModifierHelpers';
import {
	formatTooltipLegacyLines,
	type TooltipTokenBindings,
} from '../../../abilities/tooltipTokens';

const CARD_ID = `${formatGroupId(AbilityGroupId.Earth)}34` as '0534';
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
	{ chargeType: 'staminaCharge', chargesPerRecovery: 1, usesRecovered: 1 },
];
/** The whole cast: it ends as soon as the dash movement finishes. */
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

/** Damage a rock tile at the caster's current position (once per unique tile per cast). */
function maybeDamageCurrentTile(
	caster: Unit,
	tm: TerrainManager,
	damagedTileKeys: string[],
): void {
	if (tm.isPassable(caster.x, caster.y)) return;
	const cell = tm.grid.worldToGrid(caster.x, caster.y);
	const key = `${cell.col},${cell.row}`;
	if (damagedTileKeys.includes(key)) return;
	damagedTileKeys.push(key);
	tm.damageRock(cell.col, cell.row, ROCK_DAMAGE, caster.id);
}

export const DiggingClawsAbility: AbilityStatic = {
	id: CARD_ID,
	name: 'Digging Claws',
	image: DIGGING_CLAWS_IMAGE,
	tags: ['Entombed'],
	resourceCost: { resourceId: 'movement_points', amount: 1 },
	rechargeTurns: 0,
	maxUses: MAX_USES,
	recoveries: RECOVERIES,
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
			conditionalCancel: {
				condition: ({ caster, engine }) => {
					const terrain = engine.terrainManager;
					return terrain != null && !terrain.isPassable(caster.x, caster.y);
				},
				abilityTagFilter: ['Entombed'],
			},
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

	doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
		const eng = engine as AbilityEngineContext;
		const tm: TerrainManager | null = eng.terrainManager ?? null;

		// ── Init ──────────────────────────────────────────────────────────────────────
		if (prevTime < 0.05 && currentTime >= 0.05) {
			caster.setAbilityNote({
				abilityId: CARD_ID,
				abilityNote: {
					hitTargetIds: [],
					damagedTileKeys: [],
				},
			});
		}

		// ── Dash over: the cast ends on this tick ─────────────────────────────────────
		// A unit left inside rock is pushed out by the shared wall-unstick system.
		if (currentTime >= DASH_DURATION) {
			if (isAbilityNote(caster.abilityNote, CARD_ID)) caster.clearAbilityNote();
			return;
		}

		// ── Dash phase (currentTime < DASH_DURATION) ──────────────────────────────────
		const pos = getPixelTargetPosition(targets, 0);
		const dirResult = pos ? getDirectionFromTo(caster.x, caster.y, pos.x, pos.y) : null;
		const distToTarget = dirResult?.dist ?? 0;
		const moveDistance =
			distToTarget > 0
				? Math.min(
					((currentTime - prevTime) / DASH_DURATION) * MAX_DISTANCE,
					distToTarget,
				)
				: 0;

		// Wall-penetrating movement: bypass terrain check, call moveUnit directly
		if (pos && distToTarget > 0 && moveDistance > 0) {
			caster.invalidateMovementPath();
			caster.moveUnit(pos.x, pos.y, moveDistance);

			// Rock tile damage in transit
			if (tm && isAbilityNote(caster.abilityNote, CARD_ID)) {
				maybeDamageCurrentTile(caster, tm, caster.abilityNote.abilityNote.damagedTileKeys);
			}
		}

		// Touch damage: hit enemies overlapping the caster after movement
		if (isAbilityNote(caster.abilityNote, CARD_ID)) {
			const note = caster.abilityNote.abilityNote;
			damageEnemiesTouchingCaster({
				engine: eng,
				caster,
				abilityId: CARD_ID,
				damage: UNIT_DAMAGE,
				attackType: 'melee',
				alreadyHitIds: note.hitTargetIds,
				maxTargets: DIGGING_CLAWS_MAX_TARGETS,
			});
		}
	},

	renderTargetingPreviewSelectedTargets: createPixelTargetPreview(MAX_DISTANCE),
};

export const DiggingClawsCard: CardDef = {
	abilityId: CARD_ID,
};
