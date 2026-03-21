/**
 * BeastClaw - Player melee ability from BeastCore.
 * Box in front of caster, slashing effect. Swings twice in opposite directions.
 * First swing knocks back away; second swing knocks back toward caster.
 * Smaller knockback than Swing Bat, interrupt on hit.
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
import { tryDamageOrBlock } from '../../abilities/blockingHelpers';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';
import { DEFAULT_UNIT_RADIUS } from '../../constants/unitConstants';

const CARD_ID = `${formatGroupId(AbilityGroupId.Utility)}11`;
const PREFIRE_TIME = 0.25;
const SWING1_TIME = 0.25;
const SWING2_TIME = 0.65;
const BASE_MIN_RANGE = 0;
const BASE_MAX_RANGE = 10;
const DAMAGE = 8;
const CLAW_EFFECT_DURATION = 0.3;
const CLAW_SLASH_DELAY = 0.03;
const POISE_DAMAGE = 6;
const KNOCKBACK_MAGNITUDE = 40;
const KNOCKBACK_AIR_TIME = 0.2;
const KNOCKBACK_SLIDE_TIME = 0.12;
const BOX_SIZE = 28;

function getMinRange(_caster: Unit): number {
    return BASE_MIN_RANGE;
}

function getMaxRange(caster: Unit): number {
    return BASE_MAX_RANGE + caster.radius;
}

function getSquareInFront(
    caster: { x: number; y: number; radius: number },
    target: { x: number; y: number },
    minRange: number,
    maxRange: number,
): { corners: { x: number; y: number }[]; centerX: number; centerY: number; aimDirX: number; aimDirY: number } {
    const dx = target.x - caster.x;
    const dy = target.y - caster.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const aimDirX = dist > 0 ? dx / dist : 1;
    const aimDirY = dist > 0 ? dy / dist : 0;
    const clampedDist = Math.max(minRange, Math.min(maxRange, dist || maxRange));
    const centerX = caster.x + aimDirX * (caster.radius + clampedDist);
    const centerY = caster.y + aimDirY * (caster.radius + clampedDist);
    const half = BOX_SIZE / 2;
    const perpX = -aimDirY * half;
    const perpY = aimDirX * half;
    const corners = [
        { x: centerX - aimDirX * half - perpX, y: centerY - aimDirY * half - perpY },
        { x: centerX - aimDirX * half + perpX, y: centerY - aimDirY * half + perpY },
        { x: centerX + aimDirX * half + perpX, y: centerY + aimDirY * half + perpY },
        { x: centerX + aimDirX * half - perpX, y: centerY + aimDirY * half - perpY },
    ];
    return { corners, centerX, centerY, aimDirX, aimDirY };
}

function pointInQuad(
    px: number,
    py: number,
    q0: { x: number; y: number },
    q1: { x: number; y: number },
    q2: { x: number; y: number },
    q3: { x: number; y: number },
): boolean {
    const sign = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
        (a.x - c.x) * (b.y - c.y) - (b.x - c.x) * (a.y - c.y);
    const d0 = sign({ x: px, y: py }, q0, q1);
    const d1 = sign({ x: px, y: py }, q1, q2);
    const d2 = sign({ x: px, y: py }, q2, q3);
    const d3 = sign({ x: px, y: py }, q3, q0);
    return (d0 >= 0 && d1 >= 0 && d2 >= 0 && d3 >= 0) || (d0 <= 0 && d1 <= 0 && d2 <= 0 && d3 <= 0);
}

interface GameEngineLike {
    units: Unit[];
    getUnit(id: string): Unit | undefined;
    addEffect(effect: Effect): void;
    gameTime: number;
    eventBus: EventBus;
    interruptUnitAndRefundAbilities(unit: Unit): void;
}

const CLAW_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="beastClawGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#8b7355"/>
      <stop offset="50%" stop-color="#5d4e37"/>
      <stop offset="100%" stop-color="#3d3528"/>
    </linearGradient>
  </defs>
  <path d="M20 44 L26 32 L34 40 L42 28 M24 48 L30 36 L38 44" stroke="url(#beastClawGrad)" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M28 40 L32 28 L40 36" stroke="#8b7355" stroke-width="2" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="14" fill="#2d2d2d" stroke="#1a1a1a"/>
</svg>`;

export const BeastClawAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Beast Claw',
    image: CLAW_IMAGE,
    cooldownTime: 2.2,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { duration: PREFIRE_TIME, abilityPhase: AbilityPhase.Windup },
        { duration: 0.4, abilityPhase: AbilityPhase.Active },
        { duration: 0.4, abilityPhase: AbilityPhase.Active },
        { duration: 1.5, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target point' }] as TargetDef[],
    aiSettings: { minRange: getMinRange({} as Unit), maxRange: getMaxRange({ radius: DEFAULT_UNIT_RADIUS } as Unit) },

    getTooltipText(_gameState?: unknown): string[] {
        return [
            `Double slash in front dealing {${DAMAGE}} damage each hit. Interrupts and knocks back enemies.`,
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
        const pos = getPixelTargetPosition(targets, 0);
        if (!pos) return;

        const eng = engine as GameEngineLike;
        const minR = getMinRange(caster);
        const maxR = getMaxRange(caster);
        const { corners } = getSquareInFront(caster, pos, minR, maxR);

        const hitUnits: Unit[] = [];
        for (const unit of eng.units) {
            if (!unit.active || !unit.isAlive() || unit.teamId === caster.teamId) continue;
            if (unit.id === caster.id) continue;
            if (pointInQuad(unit.x, unit.y, corners[0]!, corners[1]!, corners[2]!, corners[3]!)) {
                hitUnits.push(unit);
            }
        }

        const doSwing = (isSecondSwing: boolean) => {
            const hitTime = isSecondSwing ? SWING2_TIME : SWING1_TIME;
            if (prevTime >= hitTime || currentTime < hitTime) return;

            // Series of slashes perpendicular to aim (left-to-right or right-to-left).
            // corners: 0=near left, 1=near right, 2=far right, 3=far left
            const slashes: { startX: number; startY: number; endX: number; endY: number }[] = [
                { startX: corners[0]!.x, startY: corners[0]!.y, endX: corners[3]!.x, endY: corners[3]!.y },
                {
                    startX: (corners[0]!.x + corners[1]!.x) / 2,
                    startY: (corners[0]!.y + corners[1]!.y) / 2,
                    endX: (corners[3]!.x + corners[2]!.x) / 2,
                    endY: (corners[3]!.y + corners[2]!.y) / 2,
                },
                { startX: corners[1]!.x, startY: corners[1]!.y, endX: corners[2]!.x, endY: corners[2]!.y },
            ];
            const order = isSecondSwing ? [2, 1, 0] : [0, 1, 2];
            for (let i = 0; i < order.length; i++) {
                const s = slashes[order[i]!]!;
                eng.addEffect(createSlashTrailEffect(
                    s.startX,
                    s.startY,
                    s.endX,
                    s.endY,
                    CLAW_EFFECT_DURATION,
                    16,
                    0xc9a055,
                    i * CLAW_SLASH_DELAY,
                ));
            }

            for (const targetUnit of hitUnits) {
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
                const flip = isSecondSwing ? -1 : 1;
                targetUnit.applyKnockback(
                    POISE_DAMAGE,
                    {
                        knockbackVector: {
                            x: tX * KNOCKBACK_MAGNITUDE * flip,
                            y: tY * KNOCKBACK_MAGNITUDE * flip,
                        },
                        knockbackAirTime: KNOCKBACK_AIR_TIME,
                        knockbackSlideTime: KNOCKBACK_SLIDE_TIME,
                        knockbackSource: { unitId: caster.id, abilityId: CARD_ID },
                    },
                    eng.eventBus,
                    (u) => eng.interruptUnitAndRefundAbilities(u),
                );
            }
        };

        doSwing(false);
        doSwing(true);
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
        const { corners } = getSquareInFront(caster, mouseWorld, minR, maxR);

        gr.clear();
        gr.moveTo(corners[0]!.x, corners[0]!.y);
        gr.lineTo(corners[1]!.x, corners[1]!.y);
        gr.lineTo(corners[2]!.x, corners[2]!.y);
        gr.lineTo(corners[3]!.x, corners[3]!.y);
        gr.lineTo(corners[0]!.x, corners[0]!.y);
        gr.fill({ color: 0x8b7355, alpha: 0.25 });
        gr.stroke({ color: 0x5d4e37, width: 2, alpha: 0.7 });
    },
};

export const BeastClawCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Beast Claw',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
