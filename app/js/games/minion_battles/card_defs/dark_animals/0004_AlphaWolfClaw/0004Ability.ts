/**
 * AlphaWolfClaw - Alpha Wolf boss melee ability.
 * Hits in a square in front of the caster. 0.8s windup, punch effect, moderate knockback.
 * Damage similar to wolf bite. Max 2 uses per round.
 */

import { AbilityState } from '../../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../../abilities/Ability';
import { AbilityPhase } from '../../../abilities/abilityTimings';
import type { Unit } from '../../../objects/Unit';
import type { TargetDef } from '../../../abilities/targeting';
import type { ResolvedTarget } from '../../../engine/types';
import { asCardDefId, type CardDef } from '../../types';
import { Effect } from '../../../objects/Effect';
import { AbilityGroupId, formatGroupId } from '../../AbilityGroupId';
import { tryDamageOrBlock } from '../../../abilities/blockingHelpers';
import { getPixelTargetPosition, getDirectionFromTo } from '../../../abilities/targetHelpers';
import { areEnemies } from '../../../engine/teams';
import type { EventBus } from '../../../engine/EventBus';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}04`;
const PREFIRE_TIME = 0.8;
const BASE_MIN_RANGE = 0;
const BASE_MAX_RANGE = 40;
const DAMAGE = 3;
const CLAW_EFFECT_DURATION = 0.4;
const POISE_DAMAGE = 8;
const KNOCKBACK_MAGNITUDE = 60;
const KNOCKBACK_AIR_TIME = 0.25;
const KNOCKBACK_SLIDE_TIME = 0.15;
/** Square side length (px) for hitbox and preview. */
const BOX_SIZE = 44;

function getMinRange(_caster: Unit): number {
    return BASE_MIN_RANGE;
}

function getMaxRange(caster: Unit): number {
    return BASE_MAX_RANGE + caster.radius;
}

/** Get the axis-aligned square corners in front of caster, oriented by aim. */
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

/** Point-in-polygon (convex quad) test. */
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
  <path d="M20 40 L28 28 L36 36 L44 24 M24 44 L32 32 L40 40" stroke="#5d4e37" stroke-width="3" fill="none" stroke-linecap="round"/>
  <circle cx="32" cy="32" r="12" fill="#2d2d2d" stroke="#1a1a1a"/>
</svg>`;

export const AlphaWolfClawAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Claw',
    image: CLAW_IMAGE,
    cooldownTime: 1.5,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { duration: PREFIRE_TIME, abilityPhase: AbilityPhase.Windup },
        { duration: 0.1, abilityPhase: AbilityPhase.Active },
        { duration: 1.5, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target point' }] as TargetDef[],
    aiSettings: {
        minRange: getMinRange({} as Unit),
        maxRange: getMaxRange({ radius: 26 } as Unit),
        maxUsesPerRound: 2,
        priority: 10,
    },

    getTooltipText(_gameState?: unknown): string[] {
        return [`Slash in a square in front, dealing {${DAMAGE}} damage and knocking back enemies.`];
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
        const { corners, centerX, centerY } = getSquareInFront(caster, pos, minR, maxR);

        const hitUnits: Unit[] = [];
        for (const unit of eng.units) {
            if (!unit.active || !unit.isAlive() || !areEnemies(caster.teamId, unit.teamId)) continue;
            if (unit.id === caster.id) continue;
            if (pointInQuad(unit.x, unit.y, corners[0]!, corners[1]!, corners[2]!, corners[3]!)) {
                hitUnits.push(unit);
            }
        }

        eng.addEffect(
            new Effect({
                x: centerX + (corners[2]!.x - centerX) * 0.5,
                y: centerY + (corners[2]!.y - centerY) * 0.5,
                duration: CLAW_EFFECT_DURATION,
                effectType: 'punch',
                startX: corners[0]!.x,
                startY: corners[0]!.y,
            }),
        );

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
        const { corners } = getSquareInFront(caster, mouseWorld, minR, maxR);

        gr.clear();
        gr.moveTo(corners[0]!.x, corners[0]!.y);
        gr.lineTo(corners[1]!.x, corners[1]!.y);
        gr.lineTo(corners[2]!.x, corners[2]!.y);
        gr.lineTo(corners[3]!.x, corners[3]!.y);
        gr.lineTo(corners[0]!.x, corners[0]!.y);
        gr.fill({ color: 0xff0000, alpha: 0.25 });
        gr.stroke({ color: 0xff0000, width: 2, alpha: 0.7 });
    },
};

export const AlphaWolfClawCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Claw',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
