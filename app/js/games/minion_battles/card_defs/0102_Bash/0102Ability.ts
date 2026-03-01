/**
 * Bash - Warrior melee ability.
 *
 * Targets one unit within range 50 + caster size.
 * Reduces movement to 0 for 0.5s windup, then checks if target is still in range
 * (with +30 bonus). If so: deals damage and spawns a bash effect at target location.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry } from '../../abilities/Ability';
import type { Unit } from '../../objects/Unit';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../engine/types';
import type { CardDef } from '../types';
import { Effect } from '../../objects/Effect';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { areEnemies } from '../../engine/teams';
import { createUnitTargetPreview } from '../../abilities/previewHelpers';
import type { EventBus } from '../../engine/EventBus';
import { DEFAULT_UNIT_RADIUS } from '../../constants/unitConstants';

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

const BASH_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <circle cx="32" cy="32" r="18" fill="#d4a574" stroke="#8B4513" stroke-width="3"/>
  <path d="M32 14 L35 20 L32 26 L29 20 Z M32 38 L35 44 L32 50 L29 44 Z M14 32 L20 35 L26 32 L20 29 Z M38 32 L44 35 L50 32 L44 29 Z" fill="#8B0000"/>
  <path d="M20 20 L26 26 M38 20 L26 26 M26 26 L26 38 M26 26 L38 38 M38 38 L20 38" stroke="#654321" stroke-width="2" fill="none"/>
</svg>`;

export const BashAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Bash',
    image: BASH_IMAGE,
    cooldownTime: 2,
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

    renderTargetingPreview: createUnitTargetPreview({
        getMinRange,
        getMaxRange,
    }),
};

export const BashCard: CardDef = {
    id: CARD_ID,
    name: 'Bash',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
