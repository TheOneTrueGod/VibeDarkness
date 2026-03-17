/**
 * EnemyArcherShot - Enemy ranged ability. Aims for 0.5s, locks target, shoots at 1.0s.
 */

import { AbilityState } from '../../abilities/Ability';
import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../engine/types';
import type { Unit } from '../../objects/Unit';
import { Projectile } from '../../objects/Projectile';
import { asCardDefId, type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { isAbilityNote } from '../../engine/AbilityNote';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';
import { deactivateProjectileOnBlock } from '../../abilities/effectHelpers';

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
    return getPixelTargetPosition(active.targets, 0);
}

export const EnemyArcherShotAbility: AbilityStatic = {
    id: CARD_ID,
    name: 'Enemy Archer Shot',
    image: ENEMY_ARCHER_SHOT_IMAGE,
    cooldownTime: 3.0,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { duration: LOCK_TIME, abilityPhase: AbilityPhase.Windup },
        { duration: PREFIRE_TIME - LOCK_TIME, abilityPhase: AbilityPhase.Active },
        { duration: 3.0, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: MAX_DISTANCE },

    getTooltipText(_gameState?: unknown): string[] {
        return [`Shoots an arrow dealing {${DAMAGE}} damage to an enemy`];
    },

    getAbilityStates(_currentTime: number): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime < LOCK_TIME && currentTime >= LOCK_TIME) {
            const pos = getPixelTargetPosition(targets, 0);
            if (pos) {
                caster.setAbilityNote({ abilityId: '0001', abilityNote: { position: { ...pos } } });
            }
        }

        if (prevTime < PREFIRE_TIME || currentTime < PREFIRE_TIME) return;
        const eng = engine as GameEngineLike;
        if (!isAbilityNote(caster.abilityNote, '0001')) return;
        const pos = caster.abilityNote.abilityNote.position;
        caster.clearAbilityNote();

        const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, pos.x, pos.y);
        if (dist === 0) return;

        const velocityX = dirX * PROJECTILE_SPEED;
        const velocityY = dirY * PROJECTILE_SPEED;

        const projectile = new Projectile({
                x: caster.x,
                y: caster.y,
                velocityX,
                velocityY,
                damage: DAMAGE,
                sourceTeamId: caster.teamId,
                sourceUnitId: caster.id,
                sourceAbilityId: CARD_ID,
                maxDistance: MAX_DISTANCE,
            });

        eng.addProjectile(projectile);
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: import('../../abilities/Ability').AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
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

        const { dirX: ux, dirY: uy, dist } = getDirectionFromTo(caster.x, caster.y, target.x, target.y);
        if (dist === 0) return;
        const lineLen = Math.min(MAX_DISTANCE, dist);

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
    id: asCardDefId(CARD_ID),
    name: 'Enemy Archer Shot',
    abilityId: CARD_ID,
    durability: 2,
    discardDuration: { duration: 1, unit: 'rounds' },
};
