/**
 * EnemyArcherShot - Enemy ranged ability. Aims for 0.5s, locks target, shoots at 1.0s.
 * Migrated to CastBehaviours.ProjectileLaunch() on the Active interval.
 */

import type { AbilityStatic, AttackBlockedInfo, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { type CardDef } from '../types';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { isAbilityNote } from '../../game/AbilityNote';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';
import { deactivateProjectileOnBlock } from '../../abilities/effectHelpers';
import { CastBehaviours } from '../../abilities/CastBehaviours';
import { defineAbility } from '../../abilities/defineAbility';

const CARD_ID = `${formatGroupId(AbilityGroupId.Enemy)}01`;
const LOCK_TIME = 0.5;
const PREFIRE_TIME = 1.0;
const PROJECTILE_SPEED = 800;
const MAX_DISTANCE = 280;
const DAMAGE = 4;
const RED = 0xff0000;

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

const _base: AbilityStatic = defineAbility({
    id: CARD_ID,
    name: 'Enemy Archer Shot',
    image: ENEMY_ARCHER_SHOT_IMAGE,
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { id: 'draw', start: 0, end: LOCK_TIME, abilityPhase: AbilityPhase.Windup },
        {
            id: 'active',
            start: LOCK_TIME,
            end: PREFIRE_TIME,
            abilityPhase: AbilityPhase.Active,
            behaviour: CastBehaviours.ProjectileLaunch()
                .withSpeed(PROJECTILE_SPEED)
                .withMaxRange(MAX_DISTANCE)
                .withBaseDamage(DAMAGE),
        },
        {
            id: 'cooldown',
            start: PREFIRE_TIME,
            end: PREFIRE_TIME + 3.0,
            abilityPhase: AbilityPhase.Cooldown,
        },
    ],
    targets: [{ type: 'pixel', label: 'Target location' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: MAX_DISTANCE },
    getRange: (_caster: Unit) => ({ minRange: 0, maxRange: MAX_DISTANCE }),

    getTooltipText(_gameState?: unknown): string[] {
        return [`Shoots an arrow dealing {${DAMAGE}} damage to an enemy`];
    },

    onAttackBlocked(_engine: unknown, _defender: Unit, attackInfo: AttackBlockedInfo): void {
        deactivateProjectileOnBlock(attackInfo);
    },
});

export const EnemyArcherShotAbility: AbilityStatic = {
    ..._base,

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
        const aimEndX = caster.x + ux * lineLen;
        const aimEndY = caster.y + uy * lineLen;

        if (elapsed < LOCK_TIME) {
            const progress = elapsed / LOCK_TIME;
            const angleDeg = 30 * (1 - progress);
            const angleRad = (angleDeg * Math.PI) / 180;
            const cos = Math.cos(angleRad);
            const sin = Math.sin(angleRad);

            const mainAlpha = 0.4 + 0.6 * progress;
            const sideAlpha = 0.2 + 0.8 * progress;

            gr.moveTo(caster.x, caster.y);
            gr.lineTo(aimEndX, aimEndY);
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
        } else if (elapsed < PREFIRE_TIME) {
            gr.moveTo(caster.x, caster.y);
            gr.lineTo(aimEndX, aimEndY);
            gr.stroke({ color: RED, width: 3, alpha: 1 });
        }

        if (elapsed < PREFIRE_TIME) {
            gr.circle(aimEndX, aimEndY, 7);
            gr.stroke({ color: RED, width: 2, alpha: 0.85 });
            gr.circle(aimEndX, aimEndY, 2.5);
            gr.fill({ color: RED, alpha: 0.95 });
        }
    },
};

export const EnemyArcherShotCard: CardDef = {
    abilityId: CARD_ID,
};
