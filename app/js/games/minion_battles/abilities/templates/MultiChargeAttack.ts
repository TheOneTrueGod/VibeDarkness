import { AbilityBase } from '../AbilityBase';
import type { AbilityRecoveryRule, AbilityAISettings, AbilityNinjutsuConfig } from '../Ability';
import { AbilityPhase, type AbilityTimingInterval } from '../abilityTimings';
import type { AbilityStatic, IAbilityPreviewGraphics } from '../Ability';
import type { UnitTag } from '../../game/units/unitTag';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { Unit } from '../../game/units/Unit';
import type { TargetDef } from '../targeting';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import type { CardDef } from '../../card_defs/types';
import { computeLungeChargeDirection, type LungeTarget } from '../behaviors/LungeMovement';
import { CastBehaviours } from '../CastBehaviours';
import type { ChargeBehaviour } from '../CastBehaviours/ChargeBehaviour';
import { Effect } from '../../game/effects/Effect';
import { createChargeCapsuleTargetPreview, drawChargeCapsuleTimingTelegraph } from '../previewHelpers';
import { getDirectionFromTo } from '../targetHelpers';
import { resolveChargeAimPoint } from './ChargeAttack';
import { getCastElapsedAt } from '../../game/time/actorClock';

export interface DashNote extends LungeTarget {
	hitTargetIds: string[];
}

export interface MultiChargeNote {
	/** Unit id when aimed at a unit (AI / legacy); empty for ground aim. */
	targetId: string;
	/** Fixed aim point for follow-up dashes when the unit is gone or aim was ground. */
	aimX: number;
	aimY: number;
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
	readonly interruptPolicy = { beforeCooldown: 'skipToCooldown' as const };

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
				{
					id: windupId,
					start: windupStart,
					end: windupEnd,
					abilityPhase: AbilityPhase.Windup,
					...juggernautTag,
					...(i === 0 ? { doNotRefund: true } : {}),
				},
				{
					id: dashId,
					start: dashStart,
					end: dashEnd,
					abilityPhase: AbilityPhase.Active,
					...juggernautTag,
					castBehaviours: [{ timingStart: 'start', timingEnd: 'end', behaviour: this.buildChargeBehaviour(i) }],
				},
			);

			phases.push({
				id: dashId,
				windupId,
				windupStart,
				windupEnd,
				dashStart,
				dashEnd,
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
		this.targets = [{ type: 'pixel', label: 'Charge direction' }] as TargetDef[];
		this.aiSettings = {
			minRange: 0,
			maxRange: config.aiMaxRange,
			...(config.aiNinjutsu ? { ninjutsu: config.aiNinjutsu } : {}),
		};
		// Match active telegraph length (always radius + baseMaxRange), not getRange().
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

	/**
	 * Charge over dash `index`'s window. The follow-up dash aims when this one ends, from wherever the
	 * caster stands then, so the final tick of a dash window does not move or hit (as it never did).
	 * The last dash clears the note when it ends.
	 */
	private buildChargeBehaviour(index: number): ChargeBehaviour<DashNote> {
		const config = this.config;
		const isLast = index === config.dashes - 1;
		return CastBehaviours.Charge<DashNote>({
			maxRange: config.baseMaxRange,
			lungeDuration: config.lungeDuration,
			capsuleRadiusMultiplier: config.capsuleRadiusMultiplier,
			damage: config.damage,
			getNote: (ctx) => this.getChargeNote(ctx.caster, { castPayload: ctx.castPayload })?.dashes[index] ?? null,
		})
			.withAdvanceOnLastTick(false)
			.withOnHit((unit, ctx) => {
				ctx.engine.addEffect(new Effect({
					x: unit.x,
					y: unit.y,
					duration: config.effectDuration,
					effectType: config.effectType,
					effectRadius: ctx.caster.radius * 2,
				}));
			})
			.withOnEnd((ctx) => {
				if (isLast) return;
				const note = this.getChargeNote(ctx.caster, { castPayload: ctx.castPayload });
				if (note && note.dashes[index + 1] === null) {
					note.dashes[index + 1] = this.buildDashNote(ctx.engine, ctx.caster, note);
				}
			})
			.withClearNoteOnEnd(isLast);
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

	renderActivePreview(
		gr: IAbilityPreviewGraphics,
		caster: Unit,
		activeAbility: ActiveAbility,
		gameTime: number,
	): void {
		const elapsed = getCastElapsedAt(activeAbility, gameTime);
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

	private getChargeNote(caster: Unit, active?: Pick<ActiveAbility, 'castPayload'>): MultiChargeNote | null {
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
		const aim = resolveChargeAimPoint(eng, targets);
		if (!aim) return null;

		const note: MultiChargeNote = {
			targetId: aim.targetId,
			aimX: aim.targetX,
			aimY: aim.targetY,
			dashes: Array.from({ length: this.config.dashes }, () => null),
		};
		note.dashes[0] = this.buildDashNote(eng, caster, note, caster.x, caster.y);
		return note;
	}

	private buildDashNote(
		eng: AbilityEngineContext,
		caster: Unit,
		note: MultiChargeNote,
		lungeStartX = caster.x,
		lungeStartY = caster.y,
	): DashNote {
		const target = note.targetId ? eng.getUnit(note.targetId) : undefined;
		const targetX = target?.isAlive() ? target.x : note.aimX;
		const targetY = target?.isAlive() ? target.y : note.aimY;
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
}
