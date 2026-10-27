import { AbilityBase } from '../AbilityBase';
import type { AbilityRecoveryRule, AbilityAISettings, AbilityNinjutsuConfig } from '../Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../abilityTimings';
import type { AbilityStatic, ActivePreviewEngineContext, IAbilityPreviewGraphics, AttackBlockedInfo } from '../Ability';
import type { UnitTag } from '../../game/units/unitTag';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { Unit } from '../../game/units/Unit';
import type { TargetDef } from '../targeting';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import type { CardDef } from '../../card_defs/types';
import { computeLungeChargeDirection } from '../behaviors/LungeMovement';
import { CastBehaviours } from '../CastBehaviours';
import type { ChargeBehaviour } from '../CastBehaviours/ChargeBehaviour';
import { Effect } from '../../game/effects/Effect';
import { tryApplyKnockbackByTier } from '../../crowdControl/knockbackKeywords';
import {
	createChargeCapsuleTargetPreview,
	drawChargeCapsuleTimingTelegraph,
	sweepTelegraphColorForViewer,
} from '../previewHelpers';
import { getDirectionFromTo } from '../targetHelpers';
import { formatTooltipLegacyLines } from '../tooltipTokens';
import { resolveTooltipContext } from '../abilityModifierHelpers';
import { getCastElapsedAt } from '../../game/time/actorClock';

export interface ChargeNote {
	targetId: string;
	targetX: number;
	targetY: number;
	lungeStartX: number;
	lungeStartY: number;
	/** Fixed lunge direction (aim + jitter) from cast start; omitted in older saves. */
	chargeDirX?: number;
	chargeDirY?: number;
	/** World origin for the lunge segment; set on first tick after windup (live caster position). */
	lungeOriginX?: number;
	lungeOriginY?: number;
	hitTargetIds: string[];
}

export interface ChargeAttackConfig {
	id: string;
	name: string;
	image: string;
	damage: number;
	windupTime: number;
	lungeDuration: number;
	cooldownDuration: number;
	baseMaxRange: number;
	aiMaxRange: number;
	capsuleRadiusMultiplier: number;
	knockbackTierOnBlock?: number;
	/** Active cast capsule tint; width is unused (preview thickness follows `capsuleRadiusMultiplier`). */
	preview: { color: number; width: number };
	effectType: string;
	effectDuration: number;
	tooltipText: string;
	requiredTags?: readonly UnitTag[];
	forbiddenTags?: readonly UnitTag[];
	maxUses?: number;
	recoveries?: readonly AbilityRecoveryRule[];
	/** Ninjutsu pool config for this ability. Use `{ ignore: true }` for boss abilities that bypass the pool. */
	aiNinjutsu?: AbilityNinjutsuConfig;
}

export class ChargeAttack extends AbilityBase<ChargeNote> {
	readonly id: string;
	readonly name: string;
	readonly image: string;
	readonly resourceCost = null;
	readonly rechargeTurns = 0;
	readonly prefireTime: number;
	readonly abilityTimings: AbilityTimingInterval[];
	readonly targets: TargetDef[];
	readonly aiSettings: AbilityAISettings;
	readonly renderTargetingPreview: AbilityStatic['renderTargetingPreview'];
	readonly requiredTags?: readonly UnitTag[];
	readonly forbiddenTags?: readonly UnitTag[];
	readonly maxUses: number;
	readonly recoveries?: readonly AbilityRecoveryRule[];
	readonly interruptPolicy = { beforeCooldown: 'skipToCooldown' as const };

	private readonly config: ChargeAttackConfig;
	/** End of windup interval (exclusive); same as lunge phase start. */
	private readonly windupEnd: number;

	constructor(config: ChargeAttackConfig) {
		super();
		this.config = config;
		this.id = config.id;
		this.name = config.name;
		this.image = config.image;
		const w = config.windupTime;
		const l = config.lungeDuration;
		const cd = config.cooldownDuration;
		this.windupEnd = w;
		this.prefireTime = w + l;
		this.abilityTimings = [
			{ id: 'windup', start: 0, end: w, abilityPhase: AbilityPhase.Windup, doNotRefund: true },
			{
				id: 'lunge',
				start: w,
				end: w + l,
				abilityPhase: AbilityPhase.Active,
				castBehaviours: [{ timingStart: 'start', timingEnd: 'end', behaviour: this.buildChargeBehaviour() }],
			},
			{ id: 'cooldown', start: w + l, end: w + l + cd, abilityPhase: AbilityPhase.Cooldown },
		];
		this.targets = [{ type: 'pixel', label: 'Charge direction' }] as TargetDef[];
		this.aiSettings = {
			minRange: 0,
			maxRange: config.aiMaxRange,
			...(config.aiNinjutsu ? { ninjutsu: config.aiNinjutsu } : {}),
		};
		this.renderTargetingPreview = createChargeCapsuleTargetPreview({
			getDashLength: (caster: Unit) => config.baseMaxRange + caster.radius,
			getCapsuleThickness: (caster: Unit) => caster.radius * config.capsuleRadiusMultiplier,
		});
		if (config.requiredTags) this.requiredTags = config.requiredTags;
		if (config.forbiddenTags) this.forbiddenTags = config.forbiddenTags;
		this.maxUses = config.maxUses ?? 1;
		if (config.recoveries) this.recoveries = config.recoveries;
	}

	get cardDef(): CardDef {
		return { abilityId: this.config.id };
	}

	/** Lunge plus path damage over the lunge window; clears the note when the lunge ends. */
	private buildChargeBehaviour(): ChargeBehaviour<ChargeNote> {
		const config = this.config;
		return CastBehaviours.Charge<ChargeNote>({
			maxRange: config.baseMaxRange,
			lungeDuration: config.lungeDuration,
			capsuleRadiusMultiplier: config.capsuleRadiusMultiplier,
			damage: config.damage,
			getNote: (ctx) => this.getChargeNote(ctx.caster, { castPayload: ctx.castPayload }),
		})
			.withBlockSource('approach')
			.withStopOnBlocked()
			.withClearNoteOnEnd()
			.withOnHit((unit, ctx) => {
				const eng = ctx.engine;
				const angleRad = (eng.generateRandomInteger(0, 359) * Math.PI) / 180;
				const radiusFactor = eng.generateRandomInteger(0, 100) / 100;
				const offsetR = unit.radius * 0.5 * radiusFactor;
				eng.addEffect(new Effect({
					x: unit.x + Math.cos(angleRad) * offsetR,
					y: unit.y + Math.sin(angleRad) * offsetR,
					duration: config.effectDuration,
					effectType: config.effectType,
					effectRadius: ctx.caster.radius * 2,
				}));
			});
	}

	getTooltipText(gameState?: unknown): string[] {
		const base = this.config.damage;
		const template = this.config.tooltipText.includes('{{DAMAGE}}')
			? this.config.tooltipText
			: this.config.tooltipText.split(`{${base}}`).join('{{DAMAGE}}');
		return formatTooltipLegacyLines(
			[template],
			{ DAMAGE: { kind: 'damage', base } },
			resolveTooltipContext(gameState, { ability: { id: this.id } }),
		);
	}

	getRange(caster: Unit): { minRange: number; maxRange: number } {
		return { minRange: 0, maxRange: this.config.baseMaxRange + caster.radius };
	}

	beginActiveCast(engine: unknown, caster: Unit, targets: ResolvedTarget[], active: ActiveAbility): void {
		const eng = engine as AbilityEngineContext;
		const note = this.buildChargeNoteFromTargets(eng, caster, targets);
		if (note) {
			active.castPayload = note;
			this.setAbilityNote(caster, note);
		}
	}

	renderActivePreview(
		gr: IAbilityPreviewGraphics,
		caster: Unit,
		activeAbility: ActiveAbility,
		gameTime: number,
		engine?: ActivePreviewEngineContext,
	): void {
		const elapsed = getCastElapsedAt(activeAbility, gameTime);
		if (elapsed < 0 || elapsed >= this.prefireTime) return;

		const note = this.getChargeNote(caster, activeAbility);
		if (!note) return;

		let ux: number;
		let uy: number;
		if (note.chargeDirX !== undefined && note.chargeDirY !== undefined) {
			ux = note.chargeDirX;
			uy = note.chargeDirY;
		} else {
			const d = getDirectionFromTo(
				note.lungeStartX, note.lungeStartY, note.targetX, note.targetY,
			);
			if (d.dist === 0) return;
			ux = d.dirX;
			uy = d.dirY;
		}

		const inActiveFrames = elapsed > this.windupEnd;
		const pctDone = (elapsed - this.windupEnd) / (this.prefireTime - this.windupEnd);

		const lineLen =
			caster.radius + (this.config.baseMaxRange
			* (inActiveFrames ? (1 - pctDone) : 1));
		const ox = caster.x;
		const oy = caster.y;
		const endX = ox + ux * lineLen;
		const endY = oy + uy * lineLen;

		const capsuleThickness = caster.radius * this.config.capsuleRadiusMultiplier;
		const c = sweepTelegraphColorForViewer(this.config.preview.color, note.hitTargetIds, engine);
		drawChargeCapsuleTimingTelegraph(
			gr,
			ox,
			oy,
			endX,
			endY,
			capsuleThickness,
			elapsed,
			this.windupEnd,
			c,
		);
	}

	onAttackBlocked(engine: unknown, defender: Unit, attackInfo: AttackBlockedInfo): void {
		const tier = this.config.knockbackTierOnBlock;
		if (tier != null) {
			if (attackInfo.type !== 'charging' || !attackInfo.sourceUnitId) return;
			const eng = engine as {
				getUnit?(id: string): Unit | undefined;
				eventBus: unknown;
				gameTime?: number;
				roundNumber?: number;
				cancelActiveAbility?(unitId: string, abilityId: string): void;
			};
			const attacker = eng.getUnit?.(attackInfo.sourceUnitId);
			if (!attacker) return;
			tryApplyKnockbackByTier(
				attacker,
				tier,
				{ unitId: defender.id, abilityId: this.config.id },
				defender.x,
				defender.y,
				{
					gameTime: eng.gameTime ?? 0,
					roundNumber: eng.roundNumber ?? 1,
					eventBus: eng.eventBus,
				},
			);
			eng.cancelActiveAbility?.(attackInfo.sourceUnitId, this.config.id);
			attacker.clearAbilityNote();
		}
	}

	/** Prefer `active.castPayload`; fall back to unit ability note (older checkpoints). */
	private getChargeNote(caster: Unit, active?: Pick<ActiveAbility, 'castPayload'>): ChargeNote | null {
		const payload = active?.castPayload;
		if (payload && typeof payload === 'object' && 'lungeStartX' in payload) {
			return payload as ChargeNote;
		}
		return this.getAbilityNote(caster);
	}

	private buildChargeNoteFromTargets(
		eng: AbilityEngineContext,
		caster: Unit,
		targets: ResolvedTarget[],
	): ChargeNote | null {
		const aim = resolveChargeAimPoint(eng, targets);
		if (!aim) return null;

		const lungeStartX = caster.x;
		const lungeStartY = caster.y;
		const { dirX: chargeDirX, dirY: chargeDirY } = computeLungeChargeDirection(
			caster, lungeStartX, lungeStartY, aim.targetX, aim.targetY,
		);
		return {
			targetId: aim.targetId,
			targetX: aim.targetX,
			targetY: aim.targetY,
			lungeStartX,
			lungeStartY,
			chargeDirX,
			chargeDirY,
			hitTargetIds: [],
		};
	}
}

/**
 * Resolve ground (pixel) or legacy unit aim for charge templates. A pixel aim taken from a unit
 * (`trackUnitId`, set on AI orders) keeps that unit's id so follow-up dashes can re-aim at it.
 */
export function resolveChargeAimPoint(
	eng: AbilityEngineContext,
	targets: ResolvedTarget[],
): { targetId: string; targetX: number; targetY: number } | null {
	const targetDef = targets[0];
	if (targetDef?.type === 'pixel' && targetDef.position) {
		return {
			targetId: targetDef.trackUnitId ?? '',
			targetX: targetDef.position.x,
			targetY: targetDef.position.y,
		};
	}
	if (targetDef?.type === 'unit' && targetDef.unitId) {
		const targetUnit = eng.getUnit(targetDef.unitId);
		if (targetUnit?.isAlive()) {
			return {
				targetId: targetDef.unitId,
				targetX: targetUnit.x,
				targetY: targetUnit.y,
			};
		}
	}
	return null;
}
