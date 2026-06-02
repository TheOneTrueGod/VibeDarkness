import { AbilityBase } from '../../../abilities/AbilityBase';
import { AbilityPhase, type AbilityTimingInterval, activeTimingIds } from '../../../abilities/abilityTimings';
import type { AbilityStatic, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import type { AbilityEngineContext } from '../../../abilities/AbilityEngineContext';
import type { Unit } from '../../../game/units/Unit';
import type { TargetDef } from '../../../abilities/targeting';
import type { ActiveAbility, ResolvedTarget } from '../../../game/types';
import { asCardDefId, type CardDef } from '../../types';
import {
    computeLungeChargeDirection,
    LungeMovement,
    type LungeTarget,
} from '../../../abilities/behaviors/LungeMovement';
import { ThickLineHitbox } from '../../../hitboxes/ThickLineHitbox';
import { Effect } from '../../../game/effects/Effect';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { createUnitTargetPreview, drawChargeCapsuleTimingTelegraph } from '../../../abilities/previewHelpers';
import { getDirectionFromTo } from '../../../abilities/targetHelpers';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { UnitTag } from '../../../game/units/unitTag';

const ABILITY_ID = `${formatGroupId(AbilityGroupId.Enemy)}11`;

// First windup is slow (telegraphs intent); the two follow-up windups are fast (quick combos).
const WINDUP1_TIME = 1.2;
const WINDUP23_TIME = 0.5;
const LUNGE_DURATION = 0.3;
const COOLDOWN_DURATION = 2.0;
const MAX_RANGE = 120;
const CAPSULE_RADIUS_MULTIPLIER = 2.0;
const DAMAGE = 5;

const DASH1_START = WINDUP1_TIME;                          // 0.80
const DASH1_END   = DASH1_START + LUNGE_DURATION;          // 1.00
const DASH2_START = DASH1_END   + WINDUP23_TIME;           // 1.25
const DASH2_END   = DASH2_START + LUNGE_DURATION;          // 1.45
const DASH3_START = DASH2_END   + WINDUP23_TIME;           // 1.70
const DASH3_END   = DASH3_START + LUNGE_DURATION;          // 1.90
const ACTIVE_END  = DASH3_END;

interface DashNote extends LungeTarget {
    hitTargetIds: string[];
}

interface TripleChargeNote {
    targetId: string;
    dash1: DashNote;
    dash2: DashNote | null;
    dash3: DashNote | null;
}

const IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="24" fill="#5a1a1a" stroke="#1a1a1a" stroke-width="3"/>
  <path d="M12 28 L22 32 L12 36 M28 28 L38 32 L28 36 M44 28 L54 32 L44 36" stroke="#ff6600" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

class TripleChargeAbilityDef extends AbilityBase<TripleChargeNote> {
    readonly id = ABILITY_ID;
    readonly name = 'Frenzied Charge';
    readonly image = IMAGE;
    readonly prefireTime = ACTIVE_END;
    readonly targets: TargetDef[] = [{ type: 'unit', label: 'Target enemy' }];
    readonly aiSettings = { minRange: 0, maxRange: 100 };
    readonly requiredTags = [UnitTag.Enraged] as const;
    readonly renderTargetingPreview: AbilityStatic['renderTargetingPreview'];

    readonly abilityTimings: AbilityTimingInterval[] = [
        { id: 'windup1', start: 0,            end: DASH1_START,  abilityPhase: AbilityPhase.Windup },
        { id: 'dash1',   start: DASH1_START,  end: DASH1_END,    abilityPhase: AbilityPhase.Active },
        { id: 'windup2', start: DASH1_END,    end: DASH2_START,  abilityPhase: AbilityPhase.Windup },
        { id: 'dash2',   start: DASH2_START,  end: DASH2_END,    abilityPhase: AbilityPhase.Active },
        { id: 'windup3', start: DASH2_END,    end: DASH3_START,  abilityPhase: AbilityPhase.Windup },
        { id: 'dash3',   start: DASH3_START,  end: DASH3_END,    abilityPhase: AbilityPhase.Active },
        { id: 'cooldown', start: ACTIVE_END,  end: ACTIVE_END + COOLDOWN_DURATION, abilityPhase: AbilityPhase.Cooldown },
    ];

    private readonly lunge1 = new LungeMovement({ maxRange: MAX_RANGE, lungeDuration: LUNGE_DURATION, windupTime: DASH1_START });
    private readonly lunge2 = new LungeMovement({ maxRange: MAX_RANGE, lungeDuration: LUNGE_DURATION, windupTime: DASH2_START });
    private readonly lunge3 = new LungeMovement({ maxRange: MAX_RANGE, lungeDuration: LUNGE_DURATION, windupTime: DASH3_START });

    constructor() {
        super();
        this.renderTargetingPreview = createUnitTargetPreview({
            getMinRange: () => 0,
            getMaxRange: (caster: Unit) => MAX_RANGE + caster.radius,
        });
    }

    get cardDef(): CardDef {
        return {
            id: asCardDefId(ABILITY_ID),
            name: 'Frenzied Charge',
            abilityId: ABILITY_ID,
            discardDuration: { duration: 1, unit: 'rounds' },
        };
    }

    getTooltipText(): string[] {
        return ['The enraged Alpha charges three times in quick succession, dealing {5} damage per hit'];
    }

    getRange(_caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: MAX_RANGE };
    }

    beginActiveCast(engine: unknown, caster: Unit, targets: ResolvedTarget[], active: ActiveAbility): void {
        const eng = engine as AbilityEngineContext;
        const targetDef = targets[0];
        if (targetDef?.type !== 'unit' || !targetDef.unitId) return;

        const targetUnit = eng.getUnit(targetDef.unitId);
        if (!targetUnit?.isAlive()) return;

        const { dirX, dirY } = computeLungeChargeDirection(
            caster, caster.x, caster.y, targetUnit.x, targetUnit.y,
        );
        const note: TripleChargeNote = {
            targetId: targetDef.unitId,
            dash1: {
                targetX: targetUnit.x,
                targetY: targetUnit.y,
                lungeStartX: caster.x,
                lungeStartY: caster.y,
                chargeDirX: dirX,
                chargeDirY: dirY,
                hitTargetIds: [],
            },
            dash2: null,
            dash3: null,
        };
        active.castPayload = note;
        this.setAbilityNote(caster, note);
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
        const note = this.getNote(caster, active);
        if (!note) return;

        const ids = activeTimingIds(currentTime, this.getAbilityTimingIntervals());

        if (ids.has('dash1')) {
            if (note.dash1.lungeOriginX === undefined) {
                note.dash1.lungeOriginX = caster.x;
                note.dash1.lungeOriginY = caster.y;
            }
            const seg = this.lunge1.advance(caster, note.dash1, prevTime, currentTime, eng);
            this.damageInPath(eng, caster, seg, note.dash1.hitTargetIds);
        }

        // Build dash2 note at start of windup2 so the telegraph can track the live target.
        if (currentTime >= DASH1_END && note.dash2 === null) {
            note.dash2 = this.buildDashNote(eng, caster, note.targetId);
        }

        if (ids.has('dash2') && note.dash2) {
            if (note.dash2.lungeOriginX === undefined) {
                note.dash2.lungeOriginX = caster.x;
                note.dash2.lungeOriginY = caster.y;
            }
            const seg = this.lunge2.advance(caster, note.dash2, prevTime, currentTime, eng);
            this.damageInPath(eng, caster, seg, note.dash2.hitTargetIds);
        }

        // Build dash3 note at start of windup3.
        if (currentTime >= DASH2_END && note.dash3 === null) {
            note.dash3 = this.buildDashNote(eng, caster, note.targetId);
        }

        if (ids.has('dash3') && note.dash3) {
            if (note.dash3.lungeOriginX === undefined) {
                note.dash3.lungeOriginX = caster.x;
                note.dash3.lungeOriginY = caster.y;
            }
            const seg = this.lunge3.advance(caster, note.dash3, prevTime, currentTime, eng);
            this.damageInPath(eng, caster, seg, note.dash3.hitTargetIds);
        }

        if (currentTime >= ACTIVE_END) {
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
        if (elapsed < 0 || elapsed >= ACTIVE_END) return;

        const note = this.getNote(caster, activeAbility);
        if (!note) return;

        const capsuleThickness = caster.radius * CAPSULE_RADIUS_MULTIPLIER;
        const lineLen = caster.radius + MAX_RANGE;

        // Show telegraph only during windup phases; skip during the actual dashes.
        let windupLocalElapsed: number;
        let windupDuration: number;
        let dirX: number;
        let dirY: number;

        if (elapsed < DASH1_START) {
            // Windup 1: slow fill toward initial target
            windupLocalElapsed = elapsed;
            windupDuration = WINDUP1_TIME;
            const d = getDirectionFromTo(
                note.dash1.lungeStartX, note.dash1.lungeStartY,
                note.dash1.targetX, note.dash1.targetY,
            );
            if (d.dist === 0) return;
            dirX = note.dash1.chargeDirX ?? d.dirX;
            dirY = note.dash1.chargeDirY ?? d.dirY;
        } else if (elapsed >= DASH1_END && elapsed < DASH2_START && note.dash2) {
            // Windup 2: fast fill toward refreshed target
            windupLocalElapsed = elapsed - DASH1_END;
            windupDuration = WINDUP23_TIME;
            const d = getDirectionFromTo(
                note.dash2.lungeStartX, note.dash2.lungeStartY,
                note.dash2.targetX, note.dash2.targetY,
            );
            if (d.dist === 0) return;
            dirX = note.dash2.chargeDirX ?? d.dirX;
            dirY = note.dash2.chargeDirY ?? d.dirY;
        } else if (elapsed >= DASH2_END && elapsed < DASH3_START && note.dash3) {
            // Windup 3: fast fill toward refreshed target
            windupLocalElapsed = elapsed - DASH2_END;
            windupDuration = WINDUP23_TIME;
            const d = getDirectionFromTo(
                note.dash3.lungeStartX, note.dash3.lungeStartY,
                note.dash3.targetX, note.dash3.targetY,
            );
            if (d.dist === 0) return;
            dirX = note.dash3.chargeDirX ?? d.dirX;
            dirY = note.dash3.chargeDirY ?? d.dirY;
        } else {
            return; // mid-dash: no telegraph
        }

        drawChargeCapsuleTimingTelegraph(
            gr,
            caster.x, caster.y,
            caster.x + dirX * lineLen,
            caster.y + dirY * lineLen,
            capsuleThickness,
            windupLocalElapsed,
            windupDuration,
            0xff6600,
        );
    }

    private buildDashNote(eng: AbilityEngineContext, caster: Unit, targetId: string): DashNote {
        const target = eng.getUnit(targetId);
        const targetX = target?.isAlive() ? target.x : caster.x;
        const targetY = target?.isAlive() ? target.y : caster.y;
        const { dirX, dirY } = computeLungeChargeDirection(caster, caster.x, caster.y, targetX, targetY);
        return {
            targetX,
            targetY,
            lungeStartX: caster.x,
            lungeStartY: caster.y,
            chargeDirX: dirX,
            chargeDirY: dirY,
            hitTargetIds: [],
        };
    }

    private damageInPath(
        eng: AbilityEngineContext,
        caster: Unit,
        segment: { fromX: number; fromY: number; toX: number; toY: number },
        hitTargetIds: string[],
    ): void {
        const capsuleRadius = caster.radius * CAPSULE_RADIUS_MULTIPLIER;
        const hitUnits = ThickLineHitbox.getUnitsInHitbox(
            eng, caster, segment.fromX, segment.fromY, segment.toX, segment.toY, capsuleRadius,
        );

        for (const unit of hitUnits) {
            if (hitTargetIds.includes(unit.id)) continue;
            if (unit.hasIFrames(eng.gameTime)) continue;

            const dealt = tryDamageOrBlock(unit, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: caster.x,
                attackerY: caster.y,
                attackerId: caster.id,
                abilityId: ABILITY_ID,
                damage: DAMAGE,
                attackType: 'charging',
            });
            if (!dealt) continue;
            hitTargetIds.push(unit.id);

            eng.addEffect(new Effect({
                x: unit.x,
                y: unit.y,
                duration: 0.25,
                effectType: 'bite',
                effectRadius: caster.radius * 2,
            }));
        }
    }

    private getNote(caster: Unit, active?: ActiveAbility): TripleChargeNote | null {
        const payload = active?.castPayload;
        if (payload && typeof payload === 'object' && 'dash1' in payload) {
            return payload as TripleChargeNote;
        }
        return this.getAbilityNote(caster);
    }
}

const instance = new TripleChargeAbilityDef();
export const AlphaWolfTripleChargeAbility = instance;
export const AlphaWolfTripleChargeCard = instance.cardDef;
