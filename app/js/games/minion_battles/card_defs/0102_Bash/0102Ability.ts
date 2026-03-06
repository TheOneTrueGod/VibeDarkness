/**
 * Bash - Warrior melee ability.
 *
 * Targets one unit within range 50 + caster size.
 * Reduces movement to 0 for 0.5s windup, then checks if target is still in range
 * (with +30 bonus). If so: deals damage and spawns a bash effect at target location.
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

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}02`;
const PREFIRE_TIME = 0.2;
const BASE_MIN_RANGE = 0;
const BASE_MAX_RANGE = 50;
const RANGE_BONUS_ON_HIT = 30;
const DAMAGE = 8;
const BASH_EFFECT_DURATION = 0.2;

/** Minimum cast range (caster cannot target closer than this). */
function getMinRange(_caster: Unit): number {
    return BASE_MIN_RANGE;
}

/** Maximum cast range (caster cannot target farther than this). */
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
}

const BASH_IMAGE = `<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fistBg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#222222"/>
      <stop offset="100%" stop-color="#000000"/>
    </linearGradient>
  </defs>
  <!-- Circular badge background -->
  <circle cx="32" cy="32" r="22" fill="url(#fistBg)" stroke="#facc15" stroke-width="3"/>

  <!-- Stylized raised fist (resist symbol) -->
  <!-- Fingers -->
  <rect x="22" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#e5e5e5" stroke="#111827" stroke-width="1.5"/>
  <rect x="29" y="19" width="7" height="8" rx="1.5" ry="1.5" fill="#e5e5e5" stroke="#111827" stroke-width="1.5"/>
  <rect x="36" y="20" width="7" height="7" rx="1.5" ry="1.5" fill="#e5e5e5" stroke="#111827" stroke-width="1.5"/>
  <!-- Thumb overlapping -->
  <path d="M22 27 C24 26 27 26 29 27 L29 31 L22 31 Z" fill="#d4d4d4" stroke="#111827" stroke-width="1.5"/>

  <!-- Palm -->
  <rect x="23" y="29" width="20" height="13" rx="3" ry="3" fill="#e5e5e5" stroke="#111827" stroke-width="1.8"/>

  <!-- Wrist / arm -->
  <rect x="26" y="40" width="14" height="8" rx="2" ry="2" fill="#111827"/>

  <!-- Accent rays to suggest impact / defiance -->
  <path d="M14 18 L20 22" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
  <path d="M48 18 L42 22" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
  <path d="M32 12 L32 18" stroke="#f97316" stroke-width="2" stroke-linecap="round"/>
</svg>`;

export const BashAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Bash',
    image: BASH_IMAGE,
    cooldownTime: 1.6,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: PREFIRE_TIME,
    targets: [{ type: 'unit', label: 'Target enemy' }] as TargetDef[],
    aiSettings: { minRange: getMinRange({} as Unit), maxRange: getMaxRange({ radius: DEFAULT_UNIT_RADIUS } as Unit) },

    getDescription(_gameState?: unknown): string {
        return `Melee attack. Wind up 0.5s (cannot move). If target stays in range, deal ${DAMAGE} damage and create a bash effect. Min range: ${BASE_MIN_RANGE}px, max range: 50 + your size.`;
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
            const startX = caster.x + dirX * (caster.radius * 0.5);
            const startY = caster.y + dirY * (caster.radius * 0.5);
            const endX = targetUnit.x - dirX * (targetUnit.radius * 0.5);
            const endY = targetUnit.y - dirY * (targetUnit.radius * 0.5);

            const bashEffect = new Effect({
                x: endX,
                y: endY,
                duration: BASH_EFFECT_DURATION,
                effectType: 'bash',
                startX,
                startY,
            });
            eng.addEffect(bashEffect);
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

export const BashCard: CardDef = {
    id: asCardDefId(CARD_ID),
    name: 'Bash',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
