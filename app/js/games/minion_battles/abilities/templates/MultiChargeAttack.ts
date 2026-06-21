import { AbilityBase } from '../AbilityBase';
import type { AbilityRecoveryRule, AbilityAISettings, AbilityNinjutsuConfig } from '../Ability';
import { AbilityPhase, type AbilityTimingInterval, activeTimingIds } from '../abilityTimings';
import type { AbilityStatic, IAbilityPreviewGraphics } from '../Ability';
import type { UnitTag } from '../../game/units/unitTag';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { Unit } from '../../game/units/Unit';
import type { TargetDef } from '../targeting';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import type { CardDef } from '../../card_defs/types';
import {
	computeLungeChargeDirection,
	LungeMovement,
	type LungeTarget,
} from '../behaviors/LungeMovement';
import { ThickLineHitbox } from '../../hitboxes/ThickLineHitbox';
import { Effect } from '../../game/effects/Effect';
import { tryDamageOrBlock } from '../blockingHelpers';
import { createUnitTargetPreview, drawChargeCapsuleTimingTelegraph } from '../previewHelpers';
import { getDirectionFromTo } from '../targetHelpers';

export interface DashNote extends LungeTarget {
	hitTargetIds: string[];
}

export interface MultiChargeNote {
	targetId: string;
	dashes: (DashNote | null)[];
}

export interface MultiChargeAttackConfig {
	id: string;
	name: string;
	image: string;
	damage: number;
	/** Number of consecutive lunges (e.g. 3 for Alpha Wolf Frenzied Charge). */
	dashes: number;
	/** Windup before the first lunge (slow telegraph). */
	firstWindupTime: number;
	/** Windup before each follow-up lunge. */
	followUpWindupTime: number;
	lungeDuration: number;
	cooldownDuration: number;
	baseMaxRange: number;
	aiMaxRange: number;
	capsuleRadiusMultiplier: number;
	preview: { color: number; width: number };
	effectType: string;
	effectDuration: number;
	tooltipText: string;
	requiredTags?: readonly UnitTag[];
	forbiddenTags?: readonly UnitTag[];
	maxUses?: number;
	recoveries?: readonly AbilityRecoveryRule[];
	/** Apply juggernaut tag to windup/dash intervals (enemy charge pattern). */
	juggernautDuringActive?: boolean;
	/** Ninjutsu pool config for this ability. Use `{ ignore: true }` for boss abilities that bypass the pool. */
	aiNinjutsu?: AbilityNinjutsuConfig;
	/**
	 * When true (default), `getRange` adds caster.radius to baseMaxRange.
	 * Triple Charge historically omits radius in getRange only.
	 */
	rangeIncludesCasterRadius?: boolean;
}

interface DashPhase {
	id: string;
	windupId: string;
	windupStart: number;
	windupEnd: number;
	dashStart: number;
	dashEnd: number;
	lunge: LungeMovement;
}

export class MultiChargeAttack extends AbilityBase<MultiChargeNote> {
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

	private readonly config: MultiChargeAttackConfig;
	private readonly dashPhases: DashPhase[];
	private readonly activeEnd: number;

	constructor(config: MultiChargeAttackConfig) {
		super();
		this.config = config;
		this.id = config.id;
		this.name = config.name;
		this.image = config.image;

		const juggernautTag = config.juggernautDuringActive
			? ({ tags: ['juggernaut'] as const })
			: {};

		const timings: AbilityTimingInterval[] = [];
		const phases: DashPhase[] = [];
		let t = 0;

		for (let i = 0; i < config.dashes; i++) {
			const windupDuration = i === 0 ? config.firstWindupTime : config.followUpWindupTime;
			const windupId = `windup${i + 1}`;
			const dashId = `dash${i + 1}`;
			const windupStart = t;
			const windupEnd = t + windupDuration;
			const dashStart = windupEnd;
			const dashEnd = dashStart + config.lungeDuration;

			timings.push(
				{ id: windupId, start: windupStart, end: windupEnd, abilityPhase: AbilityPhase.Windup, ...juggernautTag },
				{ id: dashId, start: dashStart, end: dashEnd, abilityPhase: AbilityPhase.Active, ...juggernautTag },
			);

			phases.push({
				id: dashId,
				windupId,
				windupStart,
				windupEnd,
				dashStart,
				dashEnd,
				lunge: new LungeMovement({
					maxRange: config.baseMaxRange,
					lungeDuration: config.lungeDuration,
					windupTime: dashStart,
				}),
			});

			t = dashEnd;
		}

		this.activeEnd = t;
		this.prefireTime = t;
		timings.push({
			id: 'cooldown',
			start: t,
			end: t + config.cooldownDuration,
			abilityPhase: AbilityPhase.Cooldown,
		});

		this.abilityTimings = timings;
		this.dashPhases = phases;
		this.targets = [{ type: 'unit', label: 'Target enemy' }] as TargetDef[];
		this.aiSettings = {
			minRange: 0,
			maxRange: config.aiMaxRange,
			...(config.aiNinjutsu ? { ninjutsu: config.aiNinjutsu } : {}),
		};
		this.renderTargetingPreview = createUnitTargetPreview({
			getMinRange: () => 0,
			getMaxRange: (caster: Unit) => config.baseMaxRange + caster.radius,
		});
		if (config.requiredTags) this.requiredTags = config.requiredTags;
		if (config.forbiddenTags) this.forbiddenTags = config.forbiddenTags;
		this.maxUses = config.maxUses ?? 1;
		if (config.recoveries) this.recoveries = config.recoveries;
	}

	get cardDef(): CardDef {
		return { abilityId: this.config.id };
	}

	getTooltipText(): string[] {
		return [this.config.tooltipText];
	}

	getRange(caster: Unit): { minRange: number; maxRange: number } {
		const extra = this.config.rangeIncludesCasterRadius !== false ? caster.radius : 0;
		return { minRange: 0, maxRange: this.config.baseMaxRange + extra };
	}

	beginActiveCast(engine: unknown, caster: Unit, targets: ResolvedTarget[], active: ActiveAbility): void {
		const eng = engine as AbilityEngineContext;
		const note = this.buildInitialNote(eng, caster, targets);
		if (note) {
			active.castPayload = note;
			this.setAbilityNote(caster, note);
		}
	}

	doCardEffect(
		engine: unknown,
		caster: Unit,
		_targets: ResolvedTarget[],
		prevTime: number,
		currentTime: number,
		active?: ActiveAbility,
	): void {
		const eng = engine as AbilityEngineContext;
		const note = this.getChargeNote(caster, active);
		if (!note) return;

		const ids = activeTimingIds(currentTime, this.getAbilityTimingIntervals());

		for (let i = 0; i < this.dashPhases.length; i++) {
			const phase = this.dashPhases[i];

			if (i > 0 && currentTime >= this.dashPhases[i - 1].dashEnd && note.dashes[i] === null) {
				note.dashes[i] = this.buildDashNote(eng, caster, note.targetId);
			}

			if (!ids.has(phase.id)) continue;

			const dashNote = note.dashes[i];
			if (!dashNote) continue;

			if (dashNote.lungeOriginX === undefined) {
				dashNote.lungeOriginX = caster.x;
				dashNote.lungeOriginY = caster.y;
			}

			const segment = phase.lunge.advance(caster, dashNote, prevTime, currentTime, eng);
			this.damageEnemiesInPath(eng, caster, dashNote, segment);
		}

		if (currentTime >= this.activeEnd) {
			if (active) active.castPayload = undefined;
			this.clearAbilityNote(caster);
		}
	}

	renderActivePreview(
		gr: IAbilityPreviewGraphics,
		caster: Unit,
		activeAbility: ActiveAbility,
		gameTime: number,
	): void {
		const elapsed = gameTime - activeAbility.startTime;
		if (elapsed < 0 || elapsed >= this.activeEnd) return;

		const note = this.getChargeNote(caster, activeAbility);
		if (!note) return;

		for (let i = 0; i < this.dashPhases.length; i++) {
			const phase = this.dashPhases[i];
			if (elapsed < phase.windupStart || elapsed >= phase.dashEnd) continue;

			const dashNote = note.dashes[i];
			if (!dashNote) continue;

			const d = getDirectionFromTo(
				dashNote.lungeStartX, dashNote.lungeStartY,
				dashNote.targetX, dashNote.targetY,
			);
			if (d.dist === 0) return;

			const dirX = dashNote.chargeDirX ?? d.dirX;
			const dirY = dashNote.chargeDirY ?? d.dirY;
			const windupDuration = phase.windupEnd - phase.windupStart;
			const capsuleThickness = caster.radius * this.config.capsuleRadiusMultiplier;

			const inDash = elapsed >= phase.dashStart;
			const windupLocalElapsed = inDash ? windupDuration : elapsed - phase.windupStart;
			const pctDone = inDash ? (elapsed - phase.dashStart) / (phase.dashEnd - phase.dashStart) : 0;
			const lineLen = caster.radius + this.config.baseMaxRange * (inDash ? 1 - pctDone : 1);

			drawChargeCapsuleTimingTelegraph(
				gr,
				caster.x, caster.y,
				caster.x + dirX * lineLen,
				caster.y + dirY * lineLen,
				capsuleThickness,
				windupLocalElapsed,
				windupDuration,
				this.config.preview.color,
			);
			return;
		}
	}

	private getChargeNote(caster: Unit, active?: ActiveAbility): MultiChargeNote | null {
		const payload = active?.castPayload;
		if (payload && typeof payload === 'object' && 'dashes' in payload) {
			return payload as MultiChargeNote;
		}
		return this.getAbilityNote(caster);
	}

	private buildInitialNote(
		eng: AbilityEngineContext,
		caster: Unit,
		targets: ResolvedTarget[],
	): MultiChargeNote | null {
		const targetDef = targets[0];
		if (targetDef?.type !== 'unit' || !targetDef.unitId) return null;

		const targetUnit = eng.getUnit(targetDef.unitId);
		if (!targetUnit?.isAlive()) return null;

		const dash1 = this.buildDashNote(eng, caster, targetDef.unitId, caster.x, caster.y);
		return {
			targetId: targetDef.unitId,
			dashes: [
				dash1,
				...Array.from({ length: this.config.dashes - 1 }, () => null),
			],
		};
	}

	private buildDashNote(
		eng: AbilityEngineContext,
		caster: Unit,
		targetId: string,
		lungeStartX = caster.x,
		lungeStartY = caster.y,
	): DashNote {
		const target = eng.getUnit(targetId);
		const targetX = target?.isAlive() ? target.x : caster.x;
		const targetY = target?.isAlive() ? target.y : caster.y;
		const { dirX, dirY } = computeLungeChargeDirection(
			caster, lungeStartX, lungeStartY, targetX, targetY,
		);
		return {
			targetX,
			targetY,
			lungeStartX,
			lungeStartY,
			chargeDirX: dirX,
			chargeDirY: dirY,
			hitTargetIds: [],
		};
	}

	private damageEnemiesInPath(
		eng: AbilityEngineContext,
		caster: Unit,
		dashNote: DashNote,
		segment: { fromX: number; fromY: number; toX: number; toY: number },
	): void {
		const capsuleRadius = caster.radius * this.config.capsuleRadiusMultiplier;
		const hitUnits = ThickLineHitbox.getUnitsInHitbox(
			eng, caster, segment.fromX, segment.fromY, segment.toX, segment.toY, capsuleRadius,
		);

		for (const unit of hitUnits) {
			if (dashNote.hitTargetIds.includes(unit.id)) continue;
			if (unit.hasIFrames(eng.gameTime)) continue;

			const outcome = tryDamageOrBlock(unit, {
				engine: eng,
				gameTime: eng.gameTime,
				eventBus: eng.eventBus,
				attackerX: caster.x,
				attackerY: caster.y,
				attackerId: caster.id,
				abilityId: this.config.id,
				damage: this.config.damage,
				attackType: 'charging',
			});
			if (!outcome.hit) continue;
			dashNote.hitTargetIds.push(unit.id);

			eng.addEffect(new Effect({
				x: unit.x,
				y: unit.y,
				duration: this.config.effectDuration,
				effectType: this.config.effectType,
				effectRadius: caster.radius * 2,
			}));
		}
	}
}
