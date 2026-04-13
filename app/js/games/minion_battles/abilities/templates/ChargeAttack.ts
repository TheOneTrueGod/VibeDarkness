import { AbilityBase } from '../AbilityBase';
import { AbilityPhase, type AbilityTimingInterval, activeTimingIds } from '../abilityTimings';
import type { AbilityStatic, IAbilityPreviewGraphics, AttackBlockedInfo } from '../Ability';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { Unit } from '../../game/units/Unit';
import type { TargetDef } from '../targeting';
import type { ActiveAbility, ResolvedTarget } from '../../game/types';
import { asCardDefId, type CardDef } from '../../card_defs/types';
import { computeLungeChargeDirection, LungeMovement } from '../behaviors/LungeMovement';
import { ThickLineHitbox } from '../../hitboxes/ThickLineHitbox';
import { Effect } from '../../game/effects/Effect';
import { tryDamageOrBlock } from '../blockingHelpers';
import { applyChargingBlockKnockback } from '../effectHelpers';
import { createUnitTargetPreview } from '../previewHelpers';
import { getDirectionFromTo } from '../targetHelpers';

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
    knockbackOnBlock: number;
    preview: { color: number; width: number };
    effectType: string;
    effectDuration: number;
    tooltipText: string;
    cardName: string;
    durability: number;
    discardDuration: { duration: number; unit: 'rounds' };
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
    readonly aiSettings: { minRange: number; maxRange: number };
    readonly renderTargetingPreview: AbilityStatic['renderTargetingPreview'];

    private readonly config: ChargeAttackConfig;
    private readonly lunge: LungeMovement;
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
            { id: 'windup', start: 0, end: w, abilityPhase: AbilityPhase.Windup },
            { id: 'lunge', start: w, end: w + l, abilityPhase: AbilityPhase.Active },
            { id: 'cooldown', start: w + l, end: w + l + cd, abilityPhase: AbilityPhase.Cooldown },
        ];
        this.targets = [{ type: 'unit', label: 'Target enemy' }] as TargetDef[];
        this.aiSettings = { minRange: 0, maxRange: config.aiMaxRange };
        this.lunge = new LungeMovement({
            maxRange: config.baseMaxRange,
            lungeDuration: l,
            windupTime: w,
        });
        this.renderTargetingPreview = createUnitTargetPreview({
            getMinRange: () => 0,
            getMaxRange: (caster: Unit) => config.baseMaxRange + caster.radius,
        });
    }

    get cardDef(): CardDef {
        return {
            id: asCardDefId(this.config.id),
            name: this.config.cardName,
            abilityId: this.config.id,
            durability: this.config.durability,
            discardDuration: this.config.discardDuration,
        };
    }

    getTooltipText(): string[] {
        return [this.config.tooltipText];
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

        if (activeTimingIds(currentTime, this.abilityTimings).has('windup')) return;

        if (note.lungeOriginX === undefined) {
            note.lungeOriginX = caster.x;
            note.lungeOriginY = caster.y;
        }

        const segment = this.lunge.advance(caster, note, prevTime, currentTime, eng);
        this.damageEnemiesInPath(eng, caster, note, segment);

        if (currentTime >= this.prefireTime) {
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
        if (elapsed < 0 || elapsed >= this.windupEnd) return;

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

        const lineLen = this.config.baseMaxRange + caster.radius;
        const ox = caster.x;
        const oy = caster.y;
        const endX = ox + ux * lineLen;
        const endY = oy + uy * lineLen;

        gr.moveTo(ox, oy);
        gr.lineTo(endX, endY);
        gr.stroke({
            color: this.config.preview.color,
            width: this.config.preview.width,
            alpha: 0.3,
        });
    }

    onAttackBlocked(engine: unknown, defender: Unit, attackInfo: AttackBlockedInfo): void {
        applyChargingBlockKnockback(engine, defender, attackInfo, this.config.knockbackOnBlock, this.config.id);
    }

    /** Prefer `active.castPayload`; fall back to unit ability note (older checkpoints). */
    private getChargeNote(caster: Unit, active?: ActiveAbility): ChargeNote | null {
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
        const targetDef = targets[0];
        if (targetDef?.type === 'unit' && targetDef.unitId) {
            const targetUnit = eng.getUnit(targetDef.unitId);
            if (targetUnit?.isAlive()) {
                const lungeStartX = caster.x;
                const lungeStartY = caster.y;
                const targetX = targetUnit.x;
                const targetY = targetUnit.y;
                const { dirX: chargeDirX, dirY: chargeDirY } = computeLungeChargeDirection(
                    caster, lungeStartX, lungeStartY, targetX, targetY,
                );
                return {
                    targetId: targetDef.unitId,
                    targetX,
                    targetY,
                    lungeStartX,
                    lungeStartY,
                    chargeDirX,
                    chargeDirY,
                    hitTargetIds: [],
                };
            }
        }
        return null;
    }

    private damageEnemiesInPath(
        eng: AbilityEngineContext,
        caster: Unit,
        note: ChargeNote,
        segment: { fromX: number; fromY: number; toX: number; toY: number },
    ): void {
        const capsuleRadius = caster.radius * this.config.capsuleRadiusMultiplier;
        const hitUnits = ThickLineHitbox.getUnitsInHitbox(
            eng, caster, segment.fromX, segment.fromY, segment.toX, segment.toY, capsuleRadius,
        );

        for (const unit of hitUnits) {
            if (note.hitTargetIds.includes(unit.id)) continue;
            if (unit.hasIFrames(eng.gameTime)) continue;

            const dealt = tryDamageOrBlock(unit, {
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
            if (!dealt) return;
            note.hitTargetIds.push(unit.id);

            const angleDeg = eng.generateRandomInteger(0, 359);
            const angleRad = (angleDeg * Math.PI) / 180;
            const radiusFactor = eng.generateRandomInteger(0, 100) / 100;
            const maxOffset = unit.radius * 0.5;
            const offsetR = maxOffset * radiusFactor;
            const offsetX = Math.cos(angleRad) * offsetR;
            const offsetY = Math.sin(angleRad) * offsetR;

            eng.addEffect(new Effect({
                x: unit.x + offsetX,
                y: unit.y + offsetY,
                duration: this.config.effectDuration,
                effectType: this.config.effectType,
                effectRadius: caster.radius * 2,
            }));
        }
    }
}
