/**
 * EnemyMeleeAttack - Enemy melee ability. Wind-up 0.5s (no move penalty), locks target at 0.5s, hits at 1s with a cone.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../abilities/Ability';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import type { CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { isAbilityNote } from '../../engine/AbilityNote';
import { areEnemies } from '../../engine/teams';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}02`;
const LOCK_TIME = 0.5;
const PREFIRE_TIME = 1.0;
/** Brief time after hit to keep drawing the cone flash. */
const FLASH_DURATION = 0.15;
/** Pixels beyond min range for the cone. */
const MAX_RANGE = 50;
const DAMAGE = 6;
const CONE_HALF_ANGLE_DEG = 45;
const RED = 0xff0000;

/** Min range = slightly larger than caster radius. */
function getMinRadius(caster: Unit): number {
    return caster.radius + 5;
}

function getMaxRadius(caster: Unit): number {
    return getMinRadius(caster) + MAX_RANGE;
}

interface GameEngineLike {
    units: Unit[];
    gameTime: number;
    eventBus: { emit: (event: string, data: unknown) => void };
}

function getTargetPosition(caster: Unit, active: { targets: ResolvedTarget[] }): { x: number; y: number } | null {
    if (isAbilityNote(caster.abilityNote, '0002')) {
        return caster.abilityNote.abilityNote.position;
    }
    const target = active.targets[0];
    if (!target || target.type !== 'pixel' || !target.position) return null;
    return target.position;
}

/** Check if a point (ux, uy) is inside the cone from caster toward (dx, dy), with min/max radius and half-angle in radians. */
function pointInCone(
    casterX: number, casterY: number,
    ux: number, uy: number,
    dirX: number, dirY: number,
    minR: number, maxR: number,
    halfAngleRad: number,
): boolean {
    const vx = ux - casterX;
    const vy = uy - casterY;
    const dist = Math.sqrt(vx * vx + vy * vy);
    if (dist < minR || dist > maxR) return false;
    if (dist === 0) return false;
    const nx = vx / dist;
    const ny = vy / dist;
    const dDot = dirX * nx + dirY * ny;
    return dDot >= Math.cos(halfAngleRad);
}

const ENEMY_MELEE_ATTACK_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M32 8 L32 56 M28 12 L36 12 M28 52 L36 52" stroke="#5d4e37" stroke-width="2" fill="none"/>
  <rect x="28" y="24" width="8" height="24" rx="2" fill="#654321"/>
  <circle cx="32" cy="32" r="6" fill="#2d2d2d"/>
</svg>`;

export const EnemyMeleeAttackAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Enemy Melee Attack',
    image: ENEMY_MELEE_ATTACK_IMAGE,
    cooldownTime: 2.5,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: getMaxRadius({ radius: 20 } as Unit) },

    getDescription(_gameState?: unknown): string {
        return `Wind up for 0.5s, then strike in a cone. Deals ${DAMAGE} damage. Min range just beyond melee; max ${MAX_RANGE}px farther.`;
    },

    getAbilityStates(currentTime: number): AbilityStateEntry[] {
        if (currentTime < LOCK_TIME) return [];
        if (currentTime < PREFIRE_TIME) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 0 } }];
        }
        // Keep ability "active" briefly so we can draw the hit flash (no movement penalty).
        if (currentTime < PREFIRE_TIME + FLASH_DURATION) {
            return [{ state: AbilityState.MOVEMENT_PENALTY, data: { amount: 1 } }];
        }
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime < LOCK_TIME && currentTime >= LOCK_TIME) {
            const target = targets[0];
            if (target?.type === 'pixel' && target.position) {
                caster.setAbilityNote({ abilityId: '0002', abilityNote: { position: { ...target.position } } });
            }
        }

        if (prevTime < PREFIRE_TIME && currentTime >= PREFIRE_TIME) {
            const eng = engine as GameEngineLike;
            if (!isAbilityNote(caster.abilityNote, '0002')) return;
            const pos = caster.abilityNote.abilityNote.position;
            caster.clearAbilityNote();

            const dx = pos.x - caster.x;
            const dy = pos.y - caster.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const dirX = dist > 0 ? dx / dist : 1;
            const dirY = dist > 0 ? dy / dist : 0;

            const minR = getMinRadius(caster);
            const maxR = getMaxRadius(caster);
            const halfAngleRad = (CONE_HALF_ANGLE_DEG * Math.PI) / 180;

            for (const unit of eng.units) {
                if (!unit.active || !unit.isAlive() || !areEnemies(caster.teamId, unit.teamId)) continue;
                if (unit.hasIFrames(eng.gameTime)) continue;
                if (!pointInCone(caster.x, caster.y, unit.x, unit.y, dirX, dirY, minR, maxR, halfAngleRad)) continue;
                unit.takeDamage(DAMAGE, caster.id, eng.eventBus);
            }
        }
    },

    renderPreview(
        ctx: CanvasRenderingContext2D,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void {
        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minR = getMinRadius(caster);
        const maxR = getMaxRadius(caster);
        const angle = dist > 0 ? Math.atan2(dy, dx) : 0;
        const halfRad = (CONE_HALF_ANGLE_DEG * Math.PI) / 180;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(caster.x + Math.cos(angle - halfRad) * maxR, caster.y + Math.sin(angle - halfRad) * maxR);
        ctx.lineTo(caster.x + Math.cos(angle + halfRad) * maxR, caster.y + Math.sin(angle + halfRad) * maxR);
        ctx.lineTo(caster.x + Math.cos(angle + halfRad) * minR, caster.y + Math.sin(angle + halfRad) * minR);
        ctx.lineTo(caster.x + Math.cos(angle - halfRad) * minR, caster.y + Math.sin(angle - halfRad) * minR);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 0, 0, 0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 0, 0, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    },

    renderActivePreview(
        gr: IAbilityPreviewGraphics,
        caster: Unit,
        activeAbility: { startTime: number; targets: ResolvedTarget[] },
        gameTime: number,
    ): void {
        const elapsed = gameTime - activeAbility.startTime;
        const target = getTargetPosition(caster, activeAbility);
        if (!target) return;

        const dx = target.x - caster.x;
        const dy = target.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = dist > 0 ? Math.atan2(dy, dx) : 0;
        const halfRad = (CONE_HALF_ANGLE_DEG * Math.PI) / 180;
        const minR = getMinRadius(caster);
        const maxR = getMaxRadius(caster);

        const flash = elapsed >= PREFIRE_TIME && elapsed < PREFIRE_TIME + 0.15;
        const fillAlpha = flash ? 0.5 : 0.2;
        const strokeAlpha = flash ? 0.9 : 0.45;

        // Cone slice (ring between min and max radius)
        gr.moveTo(caster.x + Math.cos(angle - halfRad) * maxR, caster.y + Math.sin(angle - halfRad) * maxR);
        gr.lineTo(caster.x + Math.cos(angle + halfRad) * maxR, caster.y + Math.sin(angle + halfRad) * maxR);
        gr.lineTo(caster.x + Math.cos(angle + halfRad) * minR, caster.y + Math.sin(angle + halfRad) * minR);
        gr.lineTo(caster.x + Math.cos(angle - halfRad) * minR, caster.y + Math.sin(angle - halfRad) * minR);
        gr.lineTo(caster.x + Math.cos(angle - halfRad) * maxR, caster.y + Math.sin(angle - halfRad) * maxR);
        gr.fill({ color: RED, alpha: fillAlpha });
        gr.stroke({ color: RED, width: 2, alpha: strokeAlpha });
    },
};

export const EnemyMeleeAttackCard: CardDef = {
    id: CARD_ID,
    name: 'Enemy Melee Attack',
    abilityId: CARD_ID,
};
