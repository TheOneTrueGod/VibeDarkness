/**
 * LanterniteStrike — short-range light pulse fired by Lanternite units while patrolling.
 * Quick windup, single-target projectile, no card needed (unit ability only).
 */

import type { AbilityStatic, AbilityStateEntry, IAbilityPreviewGraphics } from '../../abilities/Ability';
import { AbilityPhase } from '../../abilities/abilityTimings';
import type { TargetDef } from '../../abilities/targeting';
import type { ResolvedTarget } from '../../game/types';
import type { Unit } from '../../game/units/Unit';
import { Projectile } from '../../game/projectiles/Projectile';
import { AbilityGroupId, formatGroupId } from '../AbilityGroupId';
import { isAbilityNote } from '../../game/AbilityNote';
import { getPixelTargetPosition, getDirectionFromTo } from '../../abilities/targetHelpers';
import { deactivateProjectileOnBlock } from '../../abilities/effectHelpers';

export const LANTERNITE_STRIKE_ID = `${formatGroupId(AbilityGroupId.Enemy)}10`;

const LOCK_TIME = 0.4;
const PREFIRE_TIME = 0.7;
const COOLDOWN_END = 3.7;
const PROJECTILE_SPEED = 700;
const MAX_DISTANCE = 200;
const DAMAGE = 5;
const LIGHT_COLOR = 0xffe080;

interface GameEngineLike {
    addProjectile(projectile: Projectile): void;
}

export const LanterniteStrikeAbility: AbilityStatic = {
    id: LANTERNITE_STRIKE_ID,
    name: 'Light Pulse',
    image: '',
    resourceCost: null,
    rechargeTurns: 0,
    prefireTime: PREFIRE_TIME,
    abilityTimings: [
        { id: 'aim', start: 0, end: LOCK_TIME, abilityPhase: AbilityPhase.Windup },
        { id: 'fire', start: LOCK_TIME, end: PREFIRE_TIME, abilityPhase: AbilityPhase.Active },
        { id: 'cooldown', start: PREFIRE_TIME, end: COOLDOWN_END, abilityPhase: AbilityPhase.Cooldown },
    ],
    targets: [{ type: 'pixel', label: 'Target' }] as TargetDef[],
    aiSettings: { minRange: 0, maxRange: MAX_DISTANCE },

    getTooltipText(): string[] {
        return [`Emits a light pulse dealing {${DAMAGE}} damage`];
    },

    getAbilityStates(): AbilityStateEntry[] {
        return [];
    },

    doCardEffect(engine: unknown, caster: Unit, targets: ResolvedTarget[], prevTime: number, currentTime: number): void {
        if (prevTime < LOCK_TIME && currentTime >= LOCK_TIME) {
            const pos = getPixelTargetPosition(targets, 0);
            if (pos) {
                caster.setAbilityNote({ abilityId: '0010', abilityNote: { position: { ...pos } } });
            }
        }

        if (prevTime < PREFIRE_TIME || currentTime < PREFIRE_TIME) return;
        const eng = engine as GameEngineLike;
        if (!isAbilityNote(caster.abilityNote, '0010')) return;
        const pos = caster.abilityNote.abilityNote.position;
        caster.clearAbilityNote();

        const { dirX, dirY, dist } = getDirectionFromTo(caster.x, caster.y, pos.x, pos.y);
        if (dist === 0) return;

        const projectile = new Projectile({
            x: caster.x,
            y: caster.y,
            velocityX: dirX * PROJECTILE_SPEED,
            velocityY: dirY * PROJECTILE_SPEED,
            damage: DAMAGE,
            sourceTeamId: caster.teamId,
            sourceUnitId: caster.id,
            sourceAbilityId: LANTERNITE_STRIKE_ID,
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
        if (elapsed >= PREFIRE_TIME) return;

        const target = isAbilityNote(caster.abilityNote, '0010')
            ? caster.abilityNote.abilityNote.position
            : getPixelTargetPosition(activeAbility.targets, 0);
        if (!target) return;

        const { dirX: ux, dirY: uy, dist } = getDirectionFromTo(caster.x, caster.y, target.x, target.y);
        if (dist === 0) return;
        const lineLen = Math.min(MAX_DISTANCE, dist);
        const progress = elapsed < LOCK_TIME ? elapsed / LOCK_TIME : 1;

        gr.moveTo(caster.x, caster.y);
        gr.lineTo(caster.x + ux * lineLen, caster.y + uy * lineLen);
        gr.stroke({ color: LIGHT_COLOR, width: 2, alpha: 0.3 + 0.5 * progress });
    },

    renderTargetingPreview(gr: IAbilityPreviewGraphics, caster: Unit): void {
        gr.circle(caster.x, caster.y, MAX_DISTANCE);
        gr.stroke({ width: 1, color: LIGHT_COLOR, alpha: 0.35 });
    },
};
