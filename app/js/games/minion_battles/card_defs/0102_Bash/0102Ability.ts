/**
 * Bash - Warrior melee ability.
 *
 * Targets one unit within range 50 + caster size.
 * Reduces movement to 0 for 0.5s windup, then checks if target is still in range
 * (with +30 bonus). If so: deals damage and spawns a bash effect at target location.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry } from '../../abilities/Ability';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import type { CardDef } from '../types';
import { Effect } from '../../objects/Effect';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { areEnemies } from '../../engine/teams';
import type { EventBus } from '../../engine/EventBus';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}02`;
const PREFIRE_TIME = 0.5;
const BASE_RANGE = 50;
const RANGE_BONUS_ON_HIT = 30;
const DAMAGE = 8;
const BASH_EFFECT_DURATION = 0.4;

function getCastRange(caster: Unit): number {
    return BASE_RANGE + caster.radius;
}

function getHitRange(caster: Unit): number {
    return BASE_RANGE + caster.radius + RANGE_BONUS_ON_HIT;
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
    cooldownTime: 2.5,
    resourceCost: null,
    rechargeTurns: 1,
    prefireTime: PREFIRE_TIME,
    targets: [{ type: 'unit', label: 'Target enemy' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: getCastRange({ radius: 20 } as Unit) },

    getDescription(_gameState?: unknown): string {
        return `Melee attack. Wind up 0.5s (cannot move). If target stays in range, deal ${DAMAGE} damage and create a bash effect. Range: 50 + your size.`;
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

            const bashEffect = new Effect({
                x: targetUnit.x,
                y: targetUnit.y,
                duration: BASH_EFFECT_DURATION,
                effectType: 'bash',
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
        const range = getCastRange(caster);
        ctx.save();
        ctx.strokeStyle = 'rgba(200, 100, 100, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(caster.x, caster.y, range, 0, Math.PI * 2);
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
};

export const BashCard: CardDef = {
    id: CARD_ID,
    name: 'Bash',
    abilityId: CARD_ID,
};
