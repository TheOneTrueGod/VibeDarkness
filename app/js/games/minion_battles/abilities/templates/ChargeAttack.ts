import { AbilityBase } from '../AbilityBase';
import { AbilityPhase, type AbilityTiming } from '../abilityTimings';
import type { AbilityStatic, IAbilityPreviewGraphics, AttackBlockedInfo } from '../Ability';
import type { AbilityEngineContext } from '../AbilityEngineContext';
import type { Unit } from '../../game/units/Unit';
import type { TargetDef } from '../targeting';
import type { ResolvedTarget } from '../../game/types';
import { asCardDefId, type CardDef } from '../../card_defs/types';
import { LungeMovement } from '../behaviors/LungeMovement';
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
    readonly cooldownTime: number;
    readonly resourceCost = null;
    readonly rechargeTurns = 0;
    readonly prefireTime: number;
    readonly abilityTimings: AbilityTiming[];
    readonly targets: TargetDef[];
    readonly aiSettings: { minRange: number; maxRange: number };
    readonly renderTargetingPreview: AbilityStatic['renderTargetingPreview'];

    private readonly config: ChargeAttackConfig;
    private readonly lunge: LungeMovement;

    constructor(config: ChargeAttackConfig) {
        super();
        this.config = config;
        this.id = config.id;
        this.name = config.name;
        this.image = config.image;
        this.cooldownTime = config.cooldownDuration;
        this.prefireTime = config.windupTime + config.lungeDuration;
        this.abilityTimings = [
            { duration: config.windupTime, abilityPhase: AbilityPhase.Windup },
            { duration: config.lungeDuration, abilityPhase: AbilityPhase.Active },
            { duration: config.cooldownDuration, abilityPhase: AbilityPhase.Cooldown },
        ];
        this.targets = [{ type: 'unit', label: 'Target enemy' }] as TargetDef[];
        this.aiSettings = { minRange: 0, maxRange: config.aiMaxRange };
        this.lunge = new LungeMovement({
            maxRange: config.baseMaxRange,
            lungeDuration: config.lungeDuration,
            windupTime: config.windupTime,
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

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const eng = engine as AbilityEngineContext;

        if (this.didEnterPhase(AbilityPhase.Windup, prevTime, currentTime)) {
            this.snapshotTarget(eng, caster, targets);
        }

        const note = this.getAbilityNote(caster);
        if (!note) return;

        if (this.getPhaseAtTime(currentTime) === AbilityPhase.Windup) return;

        const segment = this.lunge.advance(caster, note, prevTime, currentTime, eng);
        this.damageEnemiesInPath(eng, caster, note, segment);

        if (currentTime >= this.prefireTime) {
            this.clearAbilityNote(caster);
        }
    }

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: { startTime: number; targets: ResolvedTarget[] },
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        if (elapsed < 0 || elapsed > this.config.windupTime) return;

        const note = this.getAbilityNote(caster);
        if (!note) return;

        const { dirX: ux, dirY: uy, dist } = getDirectionFromTo(
            note.lungeStartX, note.lungeStartY, note.targetX, note.targetY,
        );
        if (dist === 0) return;

        const lineLen = this.config.baseMaxRange + caster.radius;
        const endX = note.lungeStartX + ux * lineLen;
        const endY = note.lungeStartY + uy * lineLen;

        gr.moveTo(note.lungeStartX, note.lungeStartY);
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

    private snapshotTarget(eng: AbilityEngineContext, caster: Unit, targets: ResolvedTarget[]): void {
        const targetDef = targets[0];
        if (targetDef?.type === 'unit' && targetDef.unitId) {
            const targetUnit = eng.getUnit(targetDef.unitId);
            if (targetUnit?.isAlive()) {
                this.setAbilityNote(caster, {
                    targetId: targetDef.unitId,
                    targetX: targetUnit.x,
                    targetY: targetUnit.y,
                    lungeStartX: caster.x,
                    lungeStartY: caster.y,
                    hitTargetIds: [],
                });
            }
        }
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
