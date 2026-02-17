/**
 * EnemyArcherShot - Enemy ranged ability. Aims for 0.5s, locks target, shoots at 1.0s.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../abilities/Ability';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import { Projectile } from '../../objects/Projectile';
import type { CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { isAbilityNote } from '../../engine/AbilityNote';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}01`;
const LOCK_TIME = 0.5;
const PREFIRE_TIME = 1.0;
const PROJECTILE_SPEED = 800;
const MAX_DISTANCE = 280;
const DAMAGE = 4;
const RED = 0xff0000;

interface GameEngineLike {
    addProjectile(projectile: Projectile): void;
}

const ENEMY_ARCHER_SHOT_IMAGE = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <path d="M32 8 L32 56 M28 12 L36 12 M28 52 L36 52" stroke="#5d4e37" stroke-width="2" fill="none"/>
  <line x1="32" y1="32" x2="32" y2="8" stroke="#8B4513" stroke-width="2"/>
  <polygon points="32,4 28,14 36,14" fill="#654321"/>
  <circle cx="32" cy="32" r="4" fill="#2d2d2d"/>
</svg>`;

function getTargetPosition(caster: Unit, active: { targets: ResolvedTarget[] }): { x: number; y: number } | null {
    if (isAbilityNote(caster.abilityNote, '0001')) {
        return caster.abilityNote.abilityNote.position;
    }
    const target = active.targets[0];
    if (!target || target.type !== 'pixel' || !target.position) return null;
    return target.position;
}

export const EnemyArcherShotAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Enemy Archer Shot',
    image: ENEMY_ARCHER_SHOT_IMAGE,
    cooldownTime: 3.0,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: MAX_DISTANCE },

    getDescription(_gameState?: unknown): string {
        return `Aim for 0.5s, then fire an arrow at the locked position. Deals ${DAMAGE} damage. Range: ${MAX_DISTANCE}px.`;
    },

    getAbilityStates(_currentTime: number): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime < LOCK_TIME && currentTime >= LOCK_TIME) {
            const target = targets[0];
            if (target?.type === 'pixel' && target.position) {
                caster.setAbilityNote({ abilityId: '0001', abilityNote: { position: { ...target.position } } });
            }
        }

        // Fire projectile exactly once when we cross prefire time
        if (prevTime < PREFIRE_TIME && currentTime >= PREFIRE_TIME) {
            const eng = engine as GameEngineLike;
            if (!isAbilityNote(caster.abilityNote, '0001')) return;
            const pos = caster.abilityNote.abilityNote.position;
            caster.clearAbilityNote();

            const dx = pos.x - caster.x;
            const dy = pos.y - caster.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) return;

            const velocityX = (dx / dist) * PROJECTILE_SPEED;
            const velocityY = (dy / dist) * PROJECTILE_SPEED;

            const projectile = new Projectile({
                x: caster.x,
                y: caster.y,
                velocityX,
                velocityY,
                damage: DAMAGE,
                sourceTeamId: caster.teamId,
                sourceUnitId: caster.id,
                maxDistance: MAX_DISTANCE,
            });

            eng.addProjectile(projectile);
        }
    },

    renderPreview(
        ctx: CanvasRenderingContext2D,
        caster: Unit,
        _currentTargets: ResolvedTarget[],
        mouseWorld: { x: number; y: number },
    ): void {
        ctx.save();
        ctx.strokeStyle = 'rgba(120, 80, 40, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(caster.x, caster.y);

        const dx = mouseWorld.x - caster.x;
        const dy = mouseWorld.y - caster.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > MAX_DISTANCE) {
            const ratio = MAX_DISTANCE / dist;
            ctx.lineTo(caster.x + dx * ratio, caster.y + dy * ratio);
        } else {
            ctx.lineTo(mouseWorld.x, mouseWorld.y);
        }
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
        if (dist === 0) return;

        const lineLen = Math.min(MAX_DISTANCE, dist);
        const ux = dx / dist;
        const uy = dy / dist;

        if (elapsed < LOCK_TIME) {
            const progress = elapsed / LOCK_TIME;
            const angleDeg = 30 * (1 - progress);
            const angleRad = (angleDeg * Math.PI) / 180;
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);

            const mainAlpha = 0.4 + 0.6 * progress;
            const sideAlpha = 0.2 + 0.8 * progress;

            gr.moveTo(caster.x, caster.y);
            gr.lineTo(caster.x + ux * lineLen, caster.y + uy * lineLen);
            gr.stroke({ color: RED, width: 3, alpha: mainAlpha });

            const leftX = cos * ux + sin * uy;
            const leftY = -sin * ux + cos * uy;
            gr.moveTo(caster.x, caster.y);
            gr.lineTo(caster.x + leftX * lineLen, caster.y + leftY * lineLen);
            gr.stroke({ color: RED, width: 2, alpha: sideAlpha });

            const rightX = cos * ux - sin * uy;
            const rightY = sin * ux + cos * uy;
            gr.moveTo(caster.x, caster.y);
            gr.lineTo(caster.x + rightX * lineLen, caster.y + rightY * lineLen);
            gr.stroke({ color: RED, width: 2, alpha: sideAlpha });
        } else {
            gr.moveTo(caster.x, caster.y);
            gr.lineTo(caster.x + ux * lineLen, caster.y + uy * lineLen);
            gr.stroke({ color: RED, width: 3, alpha: 1 });
        }
    },
};

export const EnemyArcherShotCard: CardDef = {
    id: CARD_ID,
    name: 'Enemy Archer Shot',
    abilityId: CARD_ID,
};
