/**
 * Boar Charge - Lunge at a target with a wider hitbox than Dark Wolf Bite.
 * 0.6s windup, then 0.3s lunge. Deals 4 damage to each enemy crossed.
 * Capsule radius is 1.5× caster radius for a wider attack.
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
import { areEnemies } from '../../../engine/teams';
import { createUnitTargetPreview } from '../../../abilities/previewHelpers';
import type { EventBus } from '../../../engine/EventBus';
import { isAbilityNote } from '../../../engine/AbilityNote';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { applyChargingBlockKnockback } from '../../../abilities/effectHelpers';
import { getDirectionFromTo } from '../../../abilities/targetHelpers';
import type { TerrainManager } from '../../../terrain/TerrainManager';
import { computeForcedDisplacement } from '../../../engine/forceMove';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}06`;
const PREFIRE_TIME = 0.9;
const WINDUP_TIME = 0.6;
const LUNGE_DURATION = 0.3;
const LUNGE_COLLISION_STEP = 4;
const BASE_MAX_RANGE = 100;
const DAMAGE = 4;
const CHARGE_EFFECT_DURATION = 0.2;
/** Capsule radius multiplier (wider than bite). */
const CAPSULE_RADIUS_MULT = 1.5;
const AI_MAX_RANGE = 90;

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

function pointToSegmentDistance(
    x0: number, y0: number,
    x1: number, y1: number,
    ux: number, uy: number,
): number {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((ux - x0) ** 2 + (uy - y0) ** 2);
    let t = ((ux - x0) * dx + (uy - y0) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = x0 + t * dx;
    const py = y0 + t * dy;
    return Math.sqrt((ux - px) ** 2 + (uy - py) ** 2);
}

function segmentCircleOverlap(
    x0: number, y0: number, x1: number, y1: number, capR: number,
    cx: number, cy: number, cr: number,
): boolean {
    const dist = pointToSegmentDistance(x0, y0, x1, y1, cx, cy);
    return dist <= capR + cr;
}

const BOAR_CHARGE_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="24" fill="#4a3728" stroke="#2d1f14" stroke-width="2"/>
  <path d="M16 28 L28 32 L16 36 M48 28 L36 32 L48 36" stroke="#8b7355" stroke-width="4" fill="none" stroke-linecap="round"/>
</svg>`;

export const BoarChargeAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Charge',
    image: BOAR_CHARGE_IMAGE,
    cooldownTime: 2,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { duration: WINDUP_TIME, abilityPhase: AbilityPhase.Windup },
        { duration: LUNGE_DURATION, abilityPhase: AbilityPhase.Active },
        { duration: 2, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'unit', label: 'Target enemy' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: AI_MAX_RANGE },

    getTooltipText(_gameState?: unknown): string[] {
        return [`Charge at a target, dealing {${DAMAGE}} damage to each enemy crossed (wide hitbox)`];
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

        if (prevTime < 0.05 && currentTime >= 0) {
            const targetDef = targets[0];
            if (targetDef?.type === 'unit' && targetDef.unitId) {
                const targetUnit = eng.getUnit(targetDef.unitId);
                if (targetUnit?.isAlive()) {
                    caster.setAbilityNote({
                        abilityId: CARD_ID,
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

        if (!isAbilityNote(caster.abilityNote, CARD_ID)) return;

        const note = caster.abilityNote.abilityNote;

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
                x0, y0, x1, y1, segmentLength,
                { terrainManager, step: LUNGE_COLLISION_STEP },
            );
            if (distance > 0) {
                const scale = distance / segmentLength;
                caster.x = x0 + (x1 - x0) * scale;
                caster.y = y0 + (y1 - y0) * scale;
                caster.invalidateMovementPath();
            }
        }

        const capRadius = caster.radius * CAPSULE_RADIUS_MULT;
        for (const unit of eng.units) {
            if (!unit.active || !unit.isAlive() || !areEnemies(caster.teamId, unit.teamId)) continue;
            if (unit.id === caster.id) continue;
            if (note.hitTargetIds.includes(unit.id)) continue;
            if (unit.hasIFrames(eng.gameTime)) continue;

            if (segmentCircleOverlap(x0, y0, x1, y1, capRadius, unit.x, unit.y, unit.radius)) {
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
                const radiusFactor = eng.generateRandomInteger(0, 100) / 100;
                const maxOffset = unit.radius * 0.5;
                const offsetR = maxOffset * radiusFactor;
                const offsetX = Math.cos(angleRad) * offsetR;
                const offsetY = Math.sin(angleRad) * offsetR;

                eng.addEffect(new Effect({
                    x: unit.x + offsetX,
                    y: unit.y + offsetY,
                    duration: CHARGE_EFFECT_DURATION,
                    effectType: 'bite',
                    effectRadius: caster.radius * 2,
                }));
            }
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
        if (elapsed < 0 || elapsed > WINDUP_TIME) return;
        if (!isAbilityNote(caster.abilityNote, CARD_ID)) return;

        const note = caster.abilityNote.abilityNote;
        const { dirX: ux, dirY: uy } = getDirectionFromTo(
            note.lungeStartX, note.lungeStartY, note.targetX, note.targetY,
        );
        const lineLen = getMaxRange(caster);
        const endX = note.lungeStartX + ux * lineLen;
        const endY = note.lungeStartY + uy * lineLen;

        gr.moveTo(note.lungeStartX, note.lungeStartY);
        gr.lineTo(endX, endY);
        gr.stroke({ color: 0xff6600, width: 16, alpha: 0.3 });
    },

    onAttackBlocked(engine: unknown, defender: Unit, attackInfo: AttackBlockedInfo): void {
        const KNOCKBACK_MAGNITUDE = 50;
        applyChargingBlockKnockback(engine, defender, attackInfo, KNOCKBACK_MAGNITUDE, CARD_ID);
    },

    renderTargetingPreview: createUnitTargetPreview({
        getMinRange: () => 0,
        getMaxRange,
    }),
};

export const BoarChargeCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Charge',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
