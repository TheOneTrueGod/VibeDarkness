/**
 * DarkWolfBite - Lunge at a target, dealing damage to enemies crossed by the path.
 * 0.6s windup (no move), then 0.3s lunge toward target. Line-with-radius hitbox
 * deals 3 damage once per enemy per activation. AI uses only when within range 50.
 */

import { AbilityState } from '../../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import type { Unit } from '../../../objects/Unit';
import type { TargetDef } from '../../../abilities/targeting';
import type { ResolvedTarget } from '../../../engine/types';
import type { CardDef } from '../../types';
import { Effect } from '../../../objects/Effect';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { areEnemies } from '../../../engine/teams';
import { createUnitTargetPreview } from '../../../abilities/previewHelpers';
import type { EventBus } from '../../../engine/EventBus';
import { isAbilityNote } from '../../../engine/AbilityNote';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}03`;
const PREFIRE_TIME = 0.9;
const WINDUP_TIME = 0.6;
const LUNGE_DURATION = 0.3;
const BASE_MAX_RANGE = 100;
const DAMAGE = 3;
const BITE_EFFECT_DURATION = 0.2;

/** AI only tries to use when within this range (distance to target). */
const AI_MAX_RANGE = 50;

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
}

/** Minimum distance from point (ux, uy) to segment (x0,y0)-(x1,y1). */
function pointToSegmentDistance(
    x0: number, y0: number,
    x1: number, y1: number,
    ux: number, uy: number,
): number {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
        return Math.sqrt((ux - x0) ** 2 + (uy - y0) ** 2);
    }
    let t = ((ux - x0) * dx + (uy - y0) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const px = x0 + t * dx;
    const py = y0 + t * dy;
    return Math.sqrt((ux - px) ** 2 + (uy - py) ** 2);
}

/** True if circle (cx, cy, cr) overlaps capsule from (x0,y0) to (x1,y1) with radius capR. */
function segmentCircleOverlap(
    x0: number, y0: number, x1: number, y1: number, capR: number,
    cx: number, cy: number, cr: number,
): boolean {
    const dist = pointToSegmentDistance(x0, y0, x1, y1, cx, cy);
    return dist <= capR + cr;
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
    targets: [{ type: 'unit', label: 'Target enemy' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: AI_MAX_RANGE },

    getDescription(_gameState?: unknown): string {
        return `Wind up 0.6s, then lunge toward target for 0.3s. Enemies crossed take ${DAMAGE} damage (once each). Max range ${BASE_MAX_RANGE}px.`;
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

        // Move caster along lunge
        caster.x = x1;
        caster.y = y1;
        caster.clearMovement();

        // Check line segment (x0,y0)-(x1,y1) with radius caster.radius vs all enemies
        for (const unit of eng.units) {
            if (!unit.active || !unit.isAlive() || !areEnemies(caster.teamId, unit.teamId)) continue;
            if (unit.id === caster.id) continue;
            if (note.hitTargetIds.includes(unit.id)) continue;
            if (unit.hasIFrames(eng.gameTime)) continue;

            if (segmentCircleOverlap(x0, y0, x1, y1, caster.radius, unit.x, unit.y, unit.radius)) {
                unit.takeDamage(DAMAGE, caster.id, eng.eventBus);
                note.hitTargetIds.push(unit.id);

                const angleDeg = eng.generateRandomInteger(0, 359);
                const angleRad = (angleDeg * Math.PI) / 180;
                const radiusFactor = eng.generateRandomInteger(0, 100) / 100;
                const maxOffset = unit.radius * 0.5;
                const offsetR = maxOffset * radiusFactor;
                const offsetX = Math.cos(angleRad) * offsetR;
                const offsetY = Math.sin(angleRad) * offsetR;

                const biteEffect = new Effect({
                    x: unit.x + offsetX,
                    y: unit.y + offsetY,
                    duration: BITE_EFFECT_DURATION,
                    effectType: 'bite',
                    effectRadius: caster.radius * 2,
                });
                eng.addEffect(biteEffect);
            }
        }

        if (currentTime >= PREFIRE_TIME) {
            caster.clearAbilityNote();
        }
    },

    renderPreview(
        ctx: CanvasRenderingContext2D,
        caster: Unit,
        currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void {
        const maxR = getMaxRange(caster);
        ctx.save();
        ctx.strokeStyle = 'rgba(150, 100, 150, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(caster.x, caster.y, maxR, 0, Math.PI * 2);
        ctx.stroke();
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
            const ux = dx / dist;
            const uy = dy / dist;
            const endX = caster.x + ux * maxR;
            const endY = caster.y + uy * maxR;
            ctx.beginPath();
            ctx.moveTo(caster.x, caster.y);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        }
        ctx.restore();
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
        const dx = note.targetX - note.lungeStartX;
        const dy = note.targetY - note.lungeStartY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;

        const maxR = getMaxRange(caster);
        const lineLen = maxR;
        const ux = dx / dist;
        const uy = dy / dist;
        const endX = note.lungeStartX + ux * lineLen;
        const endY = note.lungeStartY + uy * lineLen;

        // 12px thick transparent red indicator line along the lunge path
        gr.moveTo(note.lungeStartX, note.lungeStartY);
        gr.lineTo(endX, endY);
        gr.stroke({ color: 0xff0000, width: 12, alpha: 0.3 });
    },

    renderTargetingPreview: createUnitTargetPreview({
        getMinRange: () => 0,
        getMaxRange,
    }),
};

export const DarkWolfBiteCard: CardDef = {
    id: CARD_ID,
    name: 'Dark Wolf Bite',
    abilityId: CARD_ID,
    durability: 1,
    discardDuration: { duration: 1, unit: 'rounds' },
};
