/**
 * Digging Claws – Earth Core card. Wall-penetrating dash that damages rock tiles in transit.
 * If the dash ends inside a wall, the unit is steadily pushed out and launched (slingshot).
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
import type { EngineContext } from '../../../game/EngineContext';
import { TerrainType } from '../../../terrain/TerrainType';
import {
	applySlingshotLaunch,
	computeSlingshotDirection,
	findNearestPassableDirection,
} from '../../../game/units/slingshotHelpers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Earth)}34` as '0534';
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
	{ chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 },
];
const DASH_DURATION = 0.4;
const SLINGSHOT_PHASE = 0.3;
const COOLDOWN_DURATION = 0.8;
const MAX_DISTANCE = 160;
const UNIT_DAMAGE = 6;
const ROCK_DAMAGE = 35;
const KNOCKBACK_TIER = 2;
const SLINGSHOT_SPEED = 400; // px/s
const SLINGSHOT_LAUNCH_MAGNITUDE = 160;
const SLINGSHOT_LAUNCH_AIR_TIME = 0.4;
const SLINGSHOT_LAUNCH_SLIDE_TIME = 0.2;
// ^ These remain intentionally distinct from GENERIC_* in slingshotHelpers — tune independently.
const AFTERIMAGE_DURATION = 6 / 60;

interface TerrainManagerLike {
	grid: { worldToGrid(x: number, y: number): { col: number; row: number } };
	isPassable(x: number, y: number): boolean;
	damageRock(col: number, row: number, damage?: number, sourceUnitId?: string | null): unknown;
}

type GameEngineLike = EngineContext;

const DIGGING_CLAWS_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="28" fill="#3a3028" stroke="#1a1a1a"/>
  <path d="M18 46 L28 28 M24 48 L34 30 M30 46 L40 28"
        stroke="#a07840" stroke-width="3.5" fill="none" stroke-linecap="round"/>
</svg>`;

/** Set slingshotDirX/Y on the ability note when the caster is stuck inside rock. */
function initSlingshotDirectionIfStuck(
	caster: Unit,
	note: {
		wallEntryX: number | null;
		wallEntryY: number | null;
		slingshotDirX: number | null;
		slingshotDirY: number | null;
	},
	tm: TerrainManagerLike,
): void {
	if (note.slingshotDirX !== null || note.slingshotDirY !== null) return;
	if (tm.isPassable(caster.x, caster.y)) return;
	const dir = computeSlingshotDirection(note.wallEntryX, note.wallEntryY, caster.x, caster.y, tm);
	if (dir) {
		note.slingshotDirX = dir.x;
		note.slingshotDirY = dir.y;
	}
}

/** Damage a rock tile at the caster's current position (once per unique tile per cast). */
function maybeDamageCurrentTile(
	caster: Unit,
	tm: TerrainManagerLike,
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
	resourceCost: null,
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
		{ id: 'slingshot', start: DASH_DURATION, end: DASH_DURATION + SLINGSHOT_PHASE, abilityPhase: AbilityPhase.Active },
		{ id: 'cooldown', start: DASH_DURATION + SLINGSHOT_PHASE, end: DASH_DURATION + SLINGSHOT_PHASE + COOLDOWN_DURATION, abilityPhase: AbilityPhase.Cooldown },
	],
	targets: [],
	aiSettings: { minRange: 0, maxRange: MAX_DISTANCE },
	abilityEvents: {
		[AbilityEventType.ON_ATTACK_HIT]: [{
			conditions: [{ type: 'always' }],
			effects: [{ type: 'applyKnockbackToPrimaryTarget', tier: KNOCKBACK_TIER, sourceAbilityId: CARD_ID }],
		}],
	},

	getTooltipText(): string[] {
		return [
			`Dashing attack that deals {${UNIT_DAMAGE}} damage and knock back enemies you touch`,
		];
	},

	getAbilityStates(currentTime: number): AbilityStateEntry[] {
		if (currentTime < DASH_DURATION) {
			return [{ state: AbilityState.IFRAMES }];
		}
		return [];
	},

	beginActiveCast(engine: unknown, caster: Unit, _targets: ResolvedTarget[], active: ActiveAbility): void {
		const eng = engine as GameEngineLike;
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
			lifetime: DASH_DURATION + SLINGSHOT_PHASE,
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
		const eng = engine as GameEngineLike;
		const tm = (eng.terrainManager as TerrainManagerLike | null) ?? null;

		// ── Init ──────────────────────────────────────────────────────────────────────
		if (prevTime < 0.05 && currentTime >= 0.05) {
			caster.setAbilityNote({
				abilityId: CARD_ID,
				abilityNote: {
					hitTargetIds: [],
					wallEntryX: null,
					wallEntryY: null,
					slingshotDirX: null,
					slingshotDirY: null,
					damagedTileKeys: [],
				},
			});
		}

		// ── Slingshot phase ────────────────────────────────────────────────────────────
		if (currentTime >= DASH_DURATION) {
			if (!isAbilityNote(caster.abilityNote, CARD_ID)) {
				return;
			}
			const note = caster.abilityNote.abilityNote;

			// Init slingshot direction when stuck (also runs after conditional-cancel "wait" resume).
			if (tm) {
				initSlingshotDirectionIfStuck(caster, note, tm);
			}

			// Active slingshot: push caster out each tick
			if (note.slingshotDirX !== null && note.slingshotDirY !== null) {
				const dt = currentTime - prevTime;
				const movePerTick = SLINGSHOT_SPEED * dt;
				caster.invalidateMovementPath();
				// Move a fixed distance in slingshot direction, bypassing terrain
				caster.moveUnit(
					caster.x + note.slingshotDirX * 10000,
					caster.y + note.slingshotDirY * 10000,
					movePerTick,
				);

				if (tm) {
					maybeDamageCurrentTile(caster, tm, note.damagedTileKeys);
				}

				if (!tm || tm.isPassable(caster.x, caster.y)) {
					// Exited wall — launch!
					applySlingshotLaunch(caster, note.slingshotDirX, note.slingshotDirY,
						SLINGSHOT_LAUNCH_MAGNITUDE, SLINGSHOT_LAUNCH_AIR_TIME, SLINGSHOT_LAUNCH_SLIDE_TIME,
						eng.eventBus, caster.id, CARD_ID);
					caster.clearAbilityNote();
					return;
				}
			}

			// Slingshot phase expired but unit still stuck: force out via nearest direction
			if (currentTime >= DASH_DURATION + SLINGSHOT_PHASE && isAbilityNote(caster.abilityNote, CARD_ID)) {
				if (tm && !tm.isPassable(caster.x, caster.y)) {
					const dir = findNearestPassableDirection(tm, caster.x, caster.y);
					if (dir) {
						let exitX = caster.x;
						let exitY = caster.y;
						for (let d = 4; d <= 800; d += 4) {
							const tx = caster.x + dir.x * d;
							const ty = caster.y + dir.y * d;
							if (tm.isPassable(tx, ty)) {
								exitX = tx;
								exitY = ty;
								break;
							}
						}
						const distToExit = Math.sqrt((exitX - caster.x) ** 2 + (exitY - caster.y) ** 2);
						if (distToExit > 0) {
							caster.invalidateMovementPath();
							caster.moveUnit(exitX, exitY, distToExit);
							applySlingshotLaunch(caster, dir.x, dir.y,
								SLINGSHOT_LAUNCH_MAGNITUDE, SLINGSHOT_LAUNCH_AIR_TIME, SLINGSHOT_LAUNCH_SLIDE_TIME,
								eng.eventBus, caster.id, CARD_ID);
						}
					}
				}
				caster.clearAbilityNote();
			}
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
			const prevX = caster.x;
			const prevY = caster.y;

			caster.invalidateMovementPath();
			caster.moveUnit(pos.x, pos.y, moveDistance);

			// Wall entry/exit tracking and rock tile damage
			if (tm) {
				const wasPassable = tm.isPassable(prevX, prevY);
				const nowPassable = tm.isPassable(caster.x, caster.y);

				if (isAbilityNote(caster.abilityNote, CARD_ID)) {
					const note = caster.abilityNote.abilityNote;
					if (wasPassable && !nowPassable) {
						note.wallEntryX = prevX;
						note.wallEntryY = prevY;
					} else if (!wasPassable && nowPassable) {
						note.wallEntryX = null;
						note.wallEntryY = null;
					}
					maybeDamageCurrentTile(caster, tm, note.damagedTileKeys);
				}
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
			});
		}
	},

	renderTargetingPreviewSelectedTargets: createPixelTargetPreview(MAX_DISTANCE),
};

export const DiggingClawsCard: CardDef = {
	abilityId: CARD_ID,
};
