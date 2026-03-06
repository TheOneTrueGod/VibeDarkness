/**
 * Swing Bat - Warrior melee ability.
 *
 * Similar to Bash: targets one unit, windup, then hit. Deals 50% more damage than Bash
 * and has 10px extra range. On hit, attempts a poise check; if the target is out of
 * Poise HP, applies knockback.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, AttackBlockedInfo } from '../../abilities/Ability';
import type { Unit } from '../../objects/Unit';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../engine/types';
import { asCardDefId, type CardDef } from '../types';
import { Effect } from '../../objects/Effect';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { areEnemies } from '../../engine/teams';
import { createUnitTargetPreview } from '../../abilities/previewHelpers';
import type { EventBus } from '../../engine/EventBus';
import { DEFAULT_UNIT_RADIUS } from '../../constants/unitConstants';
import { canAttackBeBlocked, getBlockingArcForUnit, executeBlock } from '../../abilities/blockingHelpers';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}03`;
const PREFIRE_TIME = 0.2;
const BASE_MIN_RANGE = 0;
const BASE_MAX_RANGE = 60; // 50 (Bash) + 10
const RANGE_BONUS_ON_HIT = 30;
const DAMAGE = 10; // Bash 8 * 1.5
const SWING_BAT_EFFECT_DURATION = 0.4;
const POISE_DAMAGE = 10;
const KNOCKBACK_MAGNITUDE = 80;
const KNOCKBACK_AIR_TIME = 0.3;
const KNOCKBACK_SLIDE_TIME = 0.2;

function getMinRange(_caster: Unit): number {
    return BASE_MIN_RANGE;
}

function getMaxRange(caster: Unit): number {
    return BASE_MAX_RANGE + caster.radius;
}

function getHitRange(caster: Unit): number {
    return BASE_MAX_RANGE + caster.radius + RANGE_BONUS_ON_HIT;
}

interface GameEngineLike {
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
    targets: [{ type: 'unit', label: 'Target enemy' }] as TargetDef[],
    aiSettings: { minRange: getMinRange({} as Unit), maxRange: getMaxRange({ radius: DEFAULT_UNIT_RADIUS } as Unit) },

    getDescription(_gameState?: unknown): string {
        return `Melee attack. Wind up 0.5s (cannot move). If target stays in range, deal ${DAMAGE} damage and attempt knockback (poise check). Min range: ${BASE_MIN_RANGE}px, max range: ${BASE_MAX_RANGE} + your size.`;
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
        if (!targetDef || targetDef.type !== 'unit' || !targetDef.unitId) return;

        const eng = engine as GameEngineLike;
        const targetUnit = eng.getUnit(targetDef.unitId);
        if (!targetUnit || !targetUnit.isAlive()) return;
        if (!areEnemies(caster.teamId, targetUnit.teamId)) return;
        if (targetUnit.hasIFrames(eng.gameTime)) return;

        const hitRange = getHitRange(caster);
        const dx = targetUnit.x - caster.x;
        const dy = targetUnit.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= hitRange) {
            if (canAttackBeBlocked(targetUnit, caster.x, caster.y, eng.gameTime)) {
                const block = getBlockingArcForUnit(targetUnit, eng.gameTime);
                if (block) {
                    executeBlock(eng, targetUnit, { type: 'melee', sourceUnitId: caster.id }, CARD_ID, block);
                    return;
                }
            }
            targetUnit.takeDamage(DAMAGE, caster.id, eng.eventBus);

            const dirX = dist > 0 ? dx / dist : 1;
            const dirY = dist > 0 ? dy / dist : 0;

            const knockbackVector = {
                x: dirX * KNOCKBACK_MAGNITUDE,
                y: dirY * KNOCKBACK_MAGNITUDE,
            };
            targetUnit.applyKnockback(
                POISE_DAMAGE,
                {
                    knockbackVector,
                    knockbackAirTime: KNOCKBACK_AIR_TIME,
                    knockbackSlideTime: KNOCKBACK_SLIDE_TIME,
                    knockbackSource: { unitId: caster.id, abilityId: CARD_ID },
                },
                eng.eventBus,
                (u) => eng.interruptUnitAndRefundAbilities(u),
            );

            const startX = caster.x + dirX * (caster.radius * 0.5);
            const startY = caster.y + dirY * (caster.radius * 0.5);
            const endX = targetUnit.x - dirX * (targetUnit.radius * 0.5);
            const endY = targetUnit.y - dirY * (targetUnit.radius * 0.5);

            const effect = new Effect({
                x: endX,
                y: endY,
                duration: SWING_BAT_EFFECT_DURATION,
                effectType: 'bash',
                startX,
                startY,
            });
            eng.addEffect(effect);
        }
    },

    renderPreview(
        ctx: CanvasRenderingContext2D,
        caster: Unit,
        currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void {
        const minR = getMinRange(caster);
        const maxR = getMaxRange(caster);
        ctx.save();
        ctx.strokeStyle = 'rgba(200, 100, 100, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        if (minR > 0) {
            ctx.beginPath();
            ctx.arc(caster.x, caster.y, minR, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(caster.x, caster.y, maxR, 0, Math.PI * 2);
        ctx.stroke();

        const target = currentTargets[0];
        if (target?.type === 'unit' && target.unitId) {
            ctx.strokeStyle = 'rgba(255, 100, 100, 0.9)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(caster.x, caster.y);
            ctx.lineTo(mouseWorld.x, mouseWorld.y);
            ctx.stroke();
        } else {
            ctx.strokeStyle = 'rgba(200, 200, 200, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(caster.x, caster.y);
            ctx.lineTo(mouseWorld.x, mouseWorld.y);
            ctx.stroke();
        }
        ctx.restore();
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, _attackInfo: AttackBlockedInfo): void {
        // Melee blocked: no additional behaviour.
    },

    renderTargetingPreview: createUnitTargetPreview({
        getMinRange,
        getMaxRange,
    }),
};

export const SwingBatCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Swing Bat',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
