/**
 * Swing Bat - Warrior melee ability.
 *
 * Thick line perpendicular to the aim direction, at a distance between min and max range.
 * Hits the enemy closest to the left end of the line. Wind up 0.2s, bash effect to centre of line,
 * damage + knockback (poise check). Line thickness 26, swing length 80.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { Unit } from '../../objects/Unit';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../engine/types';
import { asCardDefId, type CardDef } from '../types';
import { Effect } from '../../objects/Effect';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import type { EventBus } from '../../engine/EventBus';
import { DEFAULT_UNIT_RADIUS } from '../../constants/unitConstants';
import { canAttackBeBlocked, getBlockingArcForUnit, executeBlock } from '../../abilities/blockingHelpers';
import { ThickLineHitbox } from '../../hitboxes';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}03`;
const PREFIRE_TIME = 0.2;
const BASE_MIN_RANGE = 0;
const BASE_MAX_RANGE = 56;
const DAMAGE = 10;
const SWING_BAT_EFFECT_DURATION = 0.4;
const POISE_DAMAGE = 10;
const KNOCKBACK_MAGNITUDE = 80;
const KNOCKBACK_AIR_TIME = 0.3;
const KNOCKBACK_SLIDE_TIME = 0.2;
/** Line thickness for hitbox and preview (px). */
const LINE_THICKNESS = 26;
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

const SWING_BAT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <rect x="8" y="24" width="48" height="16" rx="4" fill="#8B4513" stroke="#654321" stroke-width="2"/>
  <ellipse cx="32" cy="32" rx="14" ry="14" fill="#d4a574" stroke="#8B4513" stroke-width="2"/>
  <path d="M32 18 L35 24 L32 30 L29 24 Z M32 34 L35 40 L32 46 L29 40 Z" fill="#8B0000"/>
</svg>`;

export const SwingBatAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Swing Bat',
    image: SWING_BAT_IMAGE,
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
            `Swing your bat dealing {${DAMAGE}} damage to an enemy, interrupting them and knocking them back.`,
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

        const targetDef = targets[0];
        if (!targetDef || targetDef.type !== 'pixel' || !targetDef.position) return;

        const eng = engine as GameEngineLike;
        const minR = getMinRange(caster);
        const maxR = getMaxRange(caster);
        const line = getPerpendicularLine(caster, targetDef.position, minR, maxR);

        const hitUnits = ThickLineHitbox.getUnitsInHitbox(
            eng,
            caster,
            line.leftX,
            line.leftY,
            line.rightX,
            line.rightY,
            LINE_THICKNESS,
        );

        const effect = new Effect({
            x: line.rightX,
            y: line.rightY,
            duration: SWING_BAT_EFFECT_DURATION,
            effectType: 'bash',
            startX: line.leftX,
            startY: line.leftY,
        });
        eng.addEffect(effect);

        if (hitUnits.length === 0) return;

        hitUnits.sort((a, b) => {
            const da = (a.x - line.leftX) ** 2 + (a.y - line.leftY) ** 2;
            const db = (b.x - line.leftX) ** 2 + (b.y - line.leftY) ** 2;
            return da - db;
        });
        const targetUnit = hitUnits[0];
        if (!targetUnit.isAlive() || targetUnit.hasIFrames(eng.gameTime)) return;

        if (canAttackBeBlocked(targetUnit, caster.x, caster.y, eng.gameTime)) {
            const block = getBlockingArcForUnit(targetUnit, eng.gameTime);
            if (block) {
                executeBlock(eng, targetUnit, { type: 'melee', sourceUnitId: caster.id }, CARD_ID, block);
                return;
            }
        }
        targetUnit.takeDamage(DAMAGE, caster.id, eng.eventBus);

        const dist = Math.sqrt(
            (targetUnit.x - caster.x) ** 2 + (targetUnit.y - caster.y) ** 2,
        );
        const dx = targetUnit.x - caster.x;
        const dy = targetUnit.y - caster.y;
        const tX = dist > 0 ? dx / dist : 1;
        const tY = dist > 0 ? dy / dist : 0;

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
        gr.fill({ color: 0x646473, alpha: 0.55 });
        gr.moveTo(midX + offX, midY + offY);
        gr.lineTo(midX - offX, midY - offY);
        gr.lineTo(rightBotX, rightBotY);
        gr.lineTo(rightTopX, rightTopY);
        gr.lineTo(midX + offX, midY + offY);
        gr.fill({ color: 0xc8c8d7, alpha: 0.7 });
        gr.moveTo(leftTopX, leftTopY);
        gr.lineTo(leftBotX, leftBotY);
        gr.lineTo(rightBotX, rightBotY);
        gr.lineTo(rightTopX, rightTopY);
        gr.lineTo(leftTopX, leftTopY);
        gr.stroke({ color: 0x505050, width: 2, alpha: 0.9 });
    },
};

export const SwingBatCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Swing Bat',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
