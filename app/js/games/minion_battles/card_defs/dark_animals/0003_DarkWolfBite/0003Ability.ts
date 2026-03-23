/**
 * DarkWolfBite - Lunge at a target, dealing damage to enemies crossed by the path.
 * 0.6s windup (no move), then 0.3s lunge toward target. Line-with-radius hitbox
 * deals 3 damage once per enemy per activation. AI uses only when within range 80.
 */

import { AbilityState } from '../../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics, AttackBlockedInfo } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../objects/Unit';
import type { TargetDef } from '../../../abilities/targeting';
import type { ResolvedTarget } from '../../../engine/types';
import { asCardDefId, type CardDef } from '../../types';
import { Effect } from '../../../objects/Effect';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { createUnitTargetPreview } from '../../../abilities/previewHelpers';
import { ThickLineHitbox } from '../../../hitboxes/ThickLineHitbox';
import type { EventBus } from '../../../engine/EventBus';
import { isAbilityNote } from '../../../engine/AbilityNote';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { applyChargingBlockKnockback } from '../../../abilities/effectHelpers';
import { getDirectionFromTo } from '../../../abilities/targetHelpers';
import type { TerrainManager } from '../../../terrain/TerrainManager';
import { computeForcedDisplacement } from '../../../engine/forceMove';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}03`;
const PREFIRE_TIME = 0.9;
const WINDUP_TIME = 0.6;
const LUNGE_DURATION = 0.3;
const COOLDOWN_DURATION = 2;
/** Step size (px) for sampling terrain collision along the lunge path. */
const LUNGE_COLLISION_STEP = 4;
const BASE_MAX_RANGE = 100;
const DAMAGE = 3;
const BITE_EFFECT_DURATION = 0.2;

/** AI only tries to use when within this range (distance to target). */
const AI_MAX_RANGE = 80;

function getMaxRange(caster: Unit): number {
    return BASE_MAX_RANGE + caster.radius;
}

interface GameEngineLike {
    getUnit(id: string): Unit | undefined;
    units: Unit[];
    addEffect(effect: Effect): void;
    gameTime: number;
    eventBus: EventBus;
    generateRandomInteger(min: number, max: number): number;
    terrainManager?: TerrainManager | null;
}

const DARK_WOLF_BITE_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="20" fill="#2d2d2d" stroke="#1a1a1a" stroke-width="2"/>
  <path d="M20 28 L28 32 L20 36 M44 28 L36 32 L44 36" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

export const DarkWolfBiteAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Dark Wolf Bite',
    image: DARK_WOLF_BITE_IMAGE,
    cooldownTime: 2,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { duration: WINDUP_TIME, abilityPhase: AbilityPhase.Windup },
        { duration: LUNGE_DURATION, abilityPhase: AbilityPhase.Active },
        { duration: COOLDOWN_DURATION, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'unit', label: 'Target enemy' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: AI_MAX_RANGE },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            `Lunge at a target, dealing {${DAMAGE}} damage to each enemy crossed`,
        ];
    },

    getRange(caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: 0, maxRange: getMaxRange(caster) };
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < PREFIRE_TIME) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const eng = engine as GameEngineLike;

        // On first tick, store target, lunge start, and target position snapshot
        if (prevTime < 0.05 && currentTime >= 0) {
            const targetDef = targets[0];
            if (targetDef?.type === 'unit' && targetDef.unitId) {
                const targetUnit = eng.getUnit(targetDef.unitId);
                if (targetUnit?.isAlive()) {
                    caster.setAbilityNote({
                        abilityId: '0003',
                        abilityNote: {
                            targetId: targetDef.unitId,
                            targetX: targetUnit.x,
                            targetY: targetUnit.y,
                            lungeStartX: caster.x,
                            lungeStartY: caster.y,
                            hitTargetIds: [],
                        },
                    });
                }
            }
        }

        if (!isAbilityNote(caster.abilityNote, '0003')) return;

        const note = caster.abilityNote.abilityNote;

        // Lunge phase: 0.6 to 0.9s — use snapshot position (targetX, targetY), not live target
        if (currentTime < WINDUP_TIME) return;

        const lungeElapsed = currentTime - WINDUP_TIME;
        const lungeProgress = Math.min(1, lungeElapsed / LUNGE_DURATION);
        const maxLungeDist = BASE_MAX_RANGE;

        const dx = note.targetX - note.lungeStartX;
        const dy = note.targetY - note.lungeStartY;
        const baseAngle = Math.atan2(dy, dx);
        const jitterDegrees = (caster.moveJitter ?? 0) * 30 - 15;
        const jitterRadians = (jitterDegrees * Math.PI) / 180;
        const finalAngle = baseAngle + jitterRadians;
        const dirX = Math.cos(finalAngle);
        const dirY = Math.sin(finalAngle);

        const prevLungeProgress = Math.min(1, (prevTime - WINDUP_TIME) / LUNGE_DURATION);
        const prevDist = prevLungeProgress * maxLungeDist;
        const x0 = note.lungeStartX + dirX * prevDist;
        const y0 = note.lungeStartY + dirY * prevDist;

        const newDist = lungeProgress * maxLungeDist;
        const x1 = note.lungeStartX + dirX * newDist;
        const y1 = note.lungeStartY + dirY * newDist;

        const segmentLength = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
        const terrainManager = eng.terrainManager ?? null;
        if (segmentLength > 0) {
            const { distance } = computeForcedDisplacement(
                x0,
                y0,
                x1,
                y1,
                segmentLength,
                { terrainManager, step: LUNGE_COLLISION_STEP },
            );
            if (distance > 0) {
                const scale = distance / segmentLength;
                caster.x = x0 + (x1 - x0) * scale;
                caster.y = y0 + (y1 - y0) * scale;
                caster.invalidateMovementPath();
            }
        }

        const hitUnits = ThickLineHitbox.getUnitsInHitbox(eng, caster, x0, y0, x1, y1, caster.radius);
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
                abilityId: CARD_ID,
                damage: DAMAGE,
                attackType: 'charging',
            });
            if (!dealt) return;
            note.hitTargetIds.push(unit.id);

            const angleDeg = eng.generateRandomInteger(0, 359);
            const angleRad = (angleDeg * Math.PI) / 180;
            const radiusFactor = eng.generateRandomInteger(20, 100) / 100;
            const maxOffset = unit.radius * 0.5;
            const offsetR = maxOffset * radiusFactor;
            const offsetX = Math.cos(angleRad) * offsetR;
            const offsetY = Math.sin(angleRad) * offsetR;

            eng.addEffect(new Effect({
                x: unit.x + offsetX,
                y: unit.y + offsetY,
                duration: BITE_EFFECT_DURATION,
                effectType: 'bite',
                effectRadius: caster.radius * 2,
            }));
        }

        if (currentTime >= PREFIRE_TIME) {
            caster.clearAbilityNote();
        }
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: { startTime: number; targets: ResolvedTarget[] },
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        // Show indicator only during windup (0 to WINDUP_TIME)
        if (elapsed < 0 || elapsed > WINDUP_TIME) return;
        if (!isAbilityNote(caster.abilityNote, '0003')) return;

        const note = caster.abilityNote.abilityNote;
        const { dirX: ux, dirY: uy, dist } = getDirectionFromTo(
            note.lungeStartX,
            note.lungeStartY,
            note.targetX,
            note.targetY,
        );
        if (dist === 0) return;
        const lineLen = getMaxRange(caster);
        const endX = note.lungeStartX + ux * lineLen;
        const endY = note.lungeStartY + uy * lineLen;

        // 12px thick transparent red indicator line along the lunge path
        gr.moveTo(note.lungeStartX, note.lungeStartY);
        gr.lineTo(endX, endY);
        gr.stroke({ color: 0xff0000, width: 12, alpha: 0.3 });
    },

    onAttackBlocked(engine: unknown, defender: Unit, attackInfo: AttackBlockedInfo): void {
        const KNOCKBACK_MAGNITUDE = 40;
        applyChargingBlockKnockback(engine, defender, attackInfo, KNOCKBACK_MAGNITUDE, CARD_ID);
    },

    renderTargetingPreview: createUnitTargetPreview({
        getMinRange: () => 0,
        getMaxRange,
    }),
};

export const DarkWolfBiteCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Dark Wolf Bite',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
