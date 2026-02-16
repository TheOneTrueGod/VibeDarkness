/**
 * Dodge - Warrior card. Move toward target up to 200px over 0.4s at constant rate.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry } from '../../abilities/Ability';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import type { CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';

const CARD_ID = `${formatGroupId(AbilityGroupId.Warrior)}01`;
const DODGE_DURATION = 0.4;
const DODGE_MAX_DISTANCE = 200;

const DODGE_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="32" cy="32" rx="24" ry="28" fill="none" stroke="#8B4513" stroke-width="3"/>
  <path d="M20 32 L44 32 M32 18 L32 46" stroke="#c0c0c0" stroke-width="2"/>
  <circle cx="32" cy="32" r="6" fill="#8b0000"/>
  <path d="M38 32 L48 32 M44 28 L48 32 L44 36" stroke="#c0c0c0" stroke-width="2" fill="none"/>
</svg>`;

export const DodgeAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Dodge',
    image: DODGE_IMAGE,
    cooldownTime: 1.5,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: DODGE_DURATION,
    targets: [{ type: 'pixel', label: 'Direction to dodge' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: 200 },

    getDescription(_gameState?: unknown): string {
        return `Dash toward the target location, moving up to ${DODGE_MAX_DISTANCE}px over ${DODGE_DURATION}s.`;
    },

    getAbilityStates(_currentTime: number): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(_engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        const target = targets[0];
        if (!target || target.type !== 'pixel' || !target.position) return;

        const dx = target.position.x - caster.x;
        const dy = target.position.y - caster.y;
        const distToTarget = Math.sqrt(dx * dx + dy * dy);
        if (distToTarget === 0) return;

        const totalAllowed = (currentTime - prevTime) / DODGE_DURATION * DODGE_MAX_DISTANCE;
        const moveDistance = Math.min(totalAllowed, distToTarget);
        if (moveDistance <= 0) return;

        caster.moveUnit(target.position.x, target.position.y, moveDistance);
    },

    renderPreview(
        ctx: CanvasRenderingContext2D,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void {
        ctx.save();
        ctx.strokeStyle = 'rgba(139, 0, 0, 0.7)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.moveTo(caster.x, caster.y);

        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > DODGE_MAX_DISTANCE) {
            const ratio = DODGE_MAX_DISTANCE / dist;
            ctx.lineTo(caster.x + dx * ratio, caster.y + dy * ratio);
        } else {
            ctx.lineTo(mouseWorld.x, mouseWorld.y);
        }
        ctx.stroke();
        ctx.restore();

        const endX = dist > DODGE_MAX_DISTANCE ? caster.x + (dx / dist) * DODGE_MAX_DISTANCE : mouseWorld.x;
        const endY = dist > DODGE_MAX_DISTANCE ? caster.y + (dy / dist) * DODGE_MAX_DISTANCE : mouseWorld.y;
        ctx.save();
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.9)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(endX, endY, 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    },
};

export const DodgeCard: CardDef = {
    id: CARD_ID,
    name: 'Dodge',
    abilityId: CARD_ID,
};
