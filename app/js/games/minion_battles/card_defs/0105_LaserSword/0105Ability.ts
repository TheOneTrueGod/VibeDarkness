/**
 * Laser Sword - Warrior melee ability.
 *
 * Like Swing Bat: thick line perpendicular to aim. Hits up to 2 targets, slightly wider line,
 * double damage. Slashing sword impact effect + thick fading slash trail (light cyan).
 * Effect and trail play even when no targets are hit.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { Unit } from '../../objects/Unit';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../engine/types';
import { asCardDefId, type CardDef } from '../types';
import { createSlashTrailEffect } from '../../abilities/effectHelpers';
import type { Effect } from '../../objects/Effect';
import type { EventBus } from '../../engine/EventBus';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { DEFAULT_UNIT_RADIUS } from '../../constants/unitConstants';
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';
import { ThickLineHitbox } from '../../hitboxes';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}05`;
const PREFIRE_TIME = 0.2;
const BASE_MIN_RANGE = 0;
const BASE_MAX_RANGE = 56;
const DAMAGE = 20;
const SLASH_TRAIL_DURATION = 0.35;
const SLASH_TRAIL_THICKNESS = 14;
const POISE_DAMAGE = 20;
const KNOCKBACK_MAGNITUDE = 80;
const KNOCKBACK_AIR_TIME = 0.3;
const KNOCKBACK_SLIDE_TIME = 0.2;
const MAX_TARGETS = 2;
/** Line thickness for hitbox and preview (px) - slightly wider than Swing Bat. */
const LINE_THICKNESS = 36;
/** Length of the perpendicular swing line (px). */
const SWING_LENGTH = 80;

function getMinRange(_caster: Unit): number {
    return BASE_MIN_RANGE;
}

function getMaxRange(caster: Unit): number {
    return BASE_MAX_RANGE + caster.radius;
}

/** Perpendicular line: centre at clamped distance along aim; left/right ends for hitbox. */
function getPerpendicularLine(
    caster: { x: number; y: number },
    target: { x: number; y: number },
    minRange: number,
    maxRange: number,
): {
    leftX: number;
    leftY: number;
    rightX: number;
    rightY: number;
    centerX: number;
    centerY: number;
    aimDirX: number;
    aimDirY: number;
} {
    const dx = target.x - caster.x;
    const dy = target.y - caster.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const aimDirX = dist > 0 ? dx / dist : 1;
    const aimDirY = dist > 0 ? dy / dist : 0;
    const clampedDist = Math.max(minRange, Math.min(maxRange, dist || maxRange));
    const centerX = caster.x + aimDirX * clampedDist;
    const centerY = caster.y + aimDirY * clampedDist;
    const half = SWING_LENGTH / 2;
    const perpX = -aimDirY * half;
    const perpY = aimDirX * half;
    return {
        leftX: centerX - perpX,
        leftY: centerY - perpY,
        rightX: centerX + perpX,
        rightY: centerY + perpY,
        centerX,
        centerY,
        aimDirX,
        aimDirY,
    };
}

interface GameEngineLike {
    units: Unit[];
    getUnit(id: string): Unit | undefined;
    addEffect(effect: Effect): void;
    gameTime: number;
    eventBus: EventBus;
    interruptUnitAndRefundAbilities(unit: Unit): void;
}

const LASER_SWORD_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="lsblade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4fb8c8"/><stop offset="0.5" stop-color="#7fdfef"/><stop offset="1" stop-color="#afffff"/></linearGradient></defs>
  <rect x="26" y="14" width="12" height="36" rx="2" fill="url(#lsblade)" stroke="#4fb8c8" stroke-width="1"/>
  <rect x="28" y="8" width="8" height="8" rx="2" fill="#5a5a6a" stroke="#404050"/>
  <ellipse cx="32" cy="32" rx="6" ry="6" fill="#7fdfef" opacity="0.6"/>
</svg>`;

export const LaserSwordAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Laser Sword',
    image: LASER_SWORD_IMAGE,
    cooldownTime: 2.1,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { duration: 0.2, abilityPhase: AbilityPhase.Windup },
        { duration: 0.1, abilityPhase: AbilityPhase.Active },
        { duration: 2.0, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target point' }] as TargetDef[],
    aiSettings: { minRange: getMinRange({} as Unit), maxRange: getMaxRange({ radius: DEFAULT_UNIT_RADIUS } as Unit) },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            `Slash with the laser sword dealing {${DAMAGE}} damage to up to ${MAX_TARGETS} enemies, interrupting and knocking them back.`,
        ];
    },

    getRange(caster: Unit): { minRange: number; maxRange: number } {
        return { minRange: getMinRange(caster), maxRange: getMaxRange(caster) };
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < PREFIRE_TIME) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime >= PREFIRE_TIME || currentTime < PREFIRE_TIME) return;

        const pos = getPixelTargetPosition(targets, 0);
        if (!pos) return;

        const eng = engine as GameEngineLike;
        const minR = getMinRange(caster);
        const maxR = getMaxRange(caster);
        const line = getPerpendicularLine(caster, pos, minR, maxR);

        const hitUnits = ThickLineHitbox.getUnitsInHitbox(
            eng,
            caster,
            line.leftX,
            line.leftY,
            line.rightX,
            line.rightY,
            LINE_THICKNESS,
        );

        // Always play slash trail (same animation whether we hit or not).
        eng.addEffect(createSlashTrailEffect(
            line.leftX,
            line.leftY,
            line.rightX,
            line.rightY,
            SLASH_TRAIL_DURATION,
            SLASH_TRAIL_THICKNESS,
        ));

        if (hitUnits.length === 0) return;

        hitUnits.sort((a, b) => {
            const da = (a.x - line.leftX) ** 2 + (a.y - line.leftY) ** 2;
            const db = (b.x - line.leftX) ** 2 + (b.y - line.leftY) ** 2;
            return da - db;
        });

        const targetsToHit = hitUnits.slice(0, MAX_TARGETS);
        for (const targetUnit of targetsToHit) {
            if (!targetUnit.isAlive() || targetUnit.hasIFrames(eng.gameTime)) continue;

            const blocked = !tryDamageOrBlock(targetUnit, {
                engine: eng,
                gameTime: eng.gameTime,
                eventBus: eng.eventBus,
                attackerX: caster.x,
                attackerY: caster.y,
                attackerId: caster.id,
                abilityId: CARD_ID,
                damage: DAMAGE,
                attackType: 'melee',
            });
            if (blocked) continue;

            const { dirX: tX, dirY: tY } = getDirectionFromTo(caster.x, caster.y, targetUnit.x, targetUnit.y);
            targetUnit.applyKnockback(
                POISE_DAMAGE,
                {
                    knockbackVector: { x: tX * KNOCKBACK_MAGNITUDE, y: tY * KNOCKBACK_MAGNITUDE },
                    knockbackAirTime: KNOCKBACK_AIR_TIME,
                    knockbackSlideTime: KNOCKBACK_SLIDE_TIME,
                    knockbackSource: { unitId: caster.id, abilityId: CARD_ID },
                },
                eng.eventBus,
                (u) => eng.interruptUnitAndRefundAbilities(u),
            );
        }
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Melee blocked: no additional behaviour.
    },

    renderTargetingPreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
        _units: Unit[],
    ): void {
        const minR = getMinRange(caster);
        const maxR = getMaxRange(caster);
        const line = getPerpendicularLine(caster, mouseWorld, minR, maxR);
        const half = LINE_THICKNESS / 2;
        const offX = line.aimDirX * half;
        const offY = line.aimDirY * half;

        const leftTopX = line.leftX + offX;
        const leftTopY = line.leftY + offY;
        const leftBotX = line.leftX - offX;
        const leftBotY = line.leftY - offY;
        const rightBotX = line.rightX - offX;
        const rightBotY = line.rightY - offY;
        const rightTopX = line.rightX + offX;
        const rightTopY = line.rightY + offY;
        const midX = line.centerX;
        const midY = line.centerY;

        gr.clear();
        gr.moveTo(leftTopX, leftTopY);
        gr.lineTo(leftBotX, leftBotY);
        gr.lineTo(midX - offX, midY - offY);
        gr.lineTo(midX + offX, midY + offY);
        gr.lineTo(leftTopX, leftTopY);
        gr.fill({ color: 0x4a9099, alpha: 0.5 });
        gr.moveTo(midX + offX, midY + offY);
        gr.lineTo(midX - offX, midY - offY);
        gr.lineTo(rightBotX, rightBotY);
        gr.lineTo(rightTopX, rightTopY);
        gr.lineTo(midX + offX, midY + offY);
        gr.fill({ color: 0x7fdfef, alpha: 0.6 });
        gr.moveTo(leftTopX, leftTopY);
        gr.lineTo(leftBotX, leftBotY);
        gr.lineTo(rightBotX, rightBotY);
        gr.lineTo(rightTopX, rightTopY);
        gr.lineTo(leftTopX, leftTopY);
        gr.stroke({ color: 0x4fb8c8, width: 2, alpha: 0.9 });
    },
};

export const LaserSwordCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Laser Sword',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
